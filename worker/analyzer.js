const { spawn } = require('child_process');

/**
 * Cooley-Tukey Radix-2 FFT (Fast Fourier Transform) 순수 JS 구현
 * @param {Float32Array} re 실수부 배열 (크기는 2의 거듭제곱이어야 함)
 * @param {Float32Array} im 허수부 배열 (크기는 2의 거듭제곱이어야 함)
 */
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  // Bit reversal permutation
  let limit = 1;
  let bit = n >> 1;
  while (limit < n) {
    for (let i = 0; i < limit; i++) {
      if (i < bit) {
        let tempRe = re[i]; re[i] = re[i + bit]; re[i + bit] = tempRe;
        let tempIm = im[i]; im[i] = im[i + bit]; im[i + bit] = tempIm;
      }
    }
    limit <<= 1;
    bit >>= 1;
  }

  // Cooley-Tukey Decimation-in-time
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const tabstep = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + halfSize; j++, k += tabstep) {
        const angle = -2 * Math.PI * k / n;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const pr = re[j + halfSize] * wr - im[j + halfSize] * wi;
        const pi = re[j + halfSize] * wi + im[j + halfSize] * wr;

        re[j + halfSize] = re[j] - pr;
        im[j + halfSize] = im[j] - pi;
        re[j] += pr;
        im[j] += pi;
      }
    }
  }
}

/**
 * 2개의 주파수가 형성하는 오디오 불협화율 계산 (Plomp-Levelt 곡선 간이 모델)
 * @param {number} f1 낮은 주파수
 * @param {number} f2 높은 주파수
 * @returns {number} 0 (협화) ~ 1 (최대 불협)
 */
function calculateDissonanceRatio(f1, f2) {
  if (f1 <= 0 || f2 <= 0) return 0;
  const minF = Math.min(f1, f2);
  const maxF = Math.max(f1, f2);
  if (minF === maxF) return 0;

  // 임계 대역폭 (Critical Bandwidth) 근사치
  const cbw = 24.7 * (4.37 * minF / 1000 + 1);
  const difference = maxF - minF;
  const x = difference / cbw;

  // Plomp-Levelt 곡선: x = 0.25 부근에서 최대 불협화(1.0) 도출
  // 곡선 근사 식: d(x) = C * (e^(-a*x) - e^(-b*x))
  const a = 3.5;
  const b = 5.75;
  const d = Math.abs(Math.exp(-a * x) - Math.exp(-b * x)) / 0.16; // 0.16은 정규화 상수
  return Math.min(1.0, d);
}

/**
 * 원격 MP3 오디오 URL을 FFmpeg을 통해 16-bit Mono 44.1kHz PCM 데이터로 다운로드/파이핑 수신
 * @param {string} audioUrl MP3 음원 경로
 * @returns {Promise<Buffer>} PCM 데이터 바퍼
 */
function downloadPCM(audioUrl) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    const args = [
      '-i', audioUrl,
      '-f', 's16le',     // 16-bit Signed Integer PCM
      '-ac', '1',        // Mono
      '-ar', '44100',    // 44.1kHz Sampling Rate
      'pipe:1'
    ];

    const child = spawn(ffmpegPath, args);
    const chunks = [];

    child.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    child.stderr.on('data', (data) => {
      // FFmpeg 로그 출력 무시 (필요시 활성화)
    });

    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 오디오 신호 버퍼 전체 분석
 * @param {Buffer} pcmBuffer 16-bit Mono PCM 버퍼
 * @returns {object} { clippingCount, dissonanceScore, grade }
 */
function analyzeAudioPCM(pcmBuffer) {
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
  const totalSamples = samples.length;
  const durationInSeconds = totalSamples / 44100;

  // 1. 클리핑 감지 (연속 3개 샘플 이상 최대치 평평하게 깎인 Top 감지)
  const CLIPPING_THRESHOLD = 32760; // 16-bit signed max (32767) 근사치
  let clippingCount = 0;
  let i = 0;

  while (i < totalSamples - 3) {
    const val = Math.abs(samples[i]);
    if (val >= CLIPPING_THRESHOLD) {
      // 연속 3샘플 이상 평평하게 깎였는지 체크
      if (Math.abs(samples[i + 1]) >= CLIPPING_THRESHOLD && Math.abs(samples[i + 2]) >= CLIPPING_THRESHOLD) {
        clippingCount++;
        // 감지된 클리핑 구간 건너뛰기
        while (i < totalSamples && Math.abs(samples[i]) >= CLIPPING_THRESHOLD) {
          i++;
        }
        continue;
      }
    }
    i++;
  }

  const clippingPerMinute = durationInSeconds > 0 ? (clippingCount / durationInSeconds) * 60 : 0;

  // 2. 불협화음 감지 (대표 8개 구간 샘플링 및 FFT 분석)
  const numSegments = 8;
  const fftSize = 2048; // 46ms Window
  let totalDissonance = 0;
  let processedSegments = 0;

  for (let s = 1; s <= numSegments; s++) {
    // 곡 전체에서 균등하게 퍼진 8개 세그먼트의 시작 오프셋 설정
    const centerSample = Math.floor((totalSamples / (numSegments + 1)) * s);
    const startOffset = centerSample - (fftSize / 2);

    if (startOffset < 0 || startOffset + fftSize > totalSamples) continue;

    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);

    // Hanning Window 적용하여 사이드 로브 차단 및 PCM 복사
    for (let j = 0; j < fftSize; j++) {
      const windowVal = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (fftSize - 1)));
      re[j] = (samples[startOffset + j] / 32768.0) * windowVal;
      im[j] = 0.0;
    }

    // FFT 기동
    fft(re, im);

    // Magnitude 스펙트럼 계산 및 주요 피크 검출
    const magnitudes = new Float32Array(fftSize / 2);
    const peaks = [];

    for (let j = 0; j < fftSize / 2; j++) {
      magnitudes[j] = Math.sqrt(re[j] * re[j] + im[j] * im[j]);
    }

    // 로컬 피크 3개 구하기 (Magnitude 크기 순 정렬)
    for (let j = 2; j < (fftSize / 2) - 2; j++) {
      if (magnitudes[j] > magnitudes[j - 1] && magnitudes[j] > magnitudes[j + 1] &&
          magnitudes[j] > magnitudes[j - 2] && magnitudes[j] > magnitudes[j + 2]) {
        const freq = (j * 44100) / fftSize;
        if (freq > 80 && freq < 8000) { // 사람이 민감하게 지각하는 음역대 제한
          peaks.push({ freq, mag: magnitudes[j] });
        }
      }
    }

    peaks.sort((a, b) => b.mag - a.mag);
    const topPeaks = peaks.slice(0, 3);

    // 피크 간의 상호 불협화율 계산하여 가산
    let segmentDissonance = 0;
    let comparisons = 0;

    for (let p1 = 0; p1 < topPeaks.length; p1++) {
      for (let p2 = p1 + 1; p2 < topPeaks.length; p2++) {
        const diss = calculateDissonanceRatio(topPeaks[p1].freq, topPeaks[p2].freq);
        segmentDissonance += diss;
        comparisons++;
      }
    }

    if (comparisons > 0) {
      totalDissonance += (segmentDissonance / comparisons);
      processedSegments++;
    }
  }

  const averageDissonance = processedSegments > 0 ? (totalDissonance / processedSegments) * 100 : 0;

  // 3. 등급 판정 로직
  let grade = 'A';
  if (clippingPerMinute >= 20 || averageDissonance >= 65) {
    grade = 'F'; // 음질 파괴 혹은 과도한 불협화음 (불량)
  } else if (clippingPerMinute >= 5 || averageDissonance >= 35) {
    grade = 'B'; // 준수한 퀄리티이나 미세 노이즈 존재
  }

  return {
    clippingCount,
    clippingPerMinute: Math.round(clippingPerMinute * 10) / 10,
    dissonanceScore: Math.round(averageDissonance),
    grade
  };
}

/**
 * E2E 물리 음질 분석 총괄 API
 * @param {string} audioUrl 음원 MP3 링크
 * @returns {Promise<object>} { clippingCount, clippingPerMinute, dissonanceScore, grade }
 */
async function analyzeAudio(audioUrl) {
  try {
    const pcmBuffer = await downloadPCM(audioUrl);
    return analyzeAudioPCM(pcmBuffer);
  } catch (err) {
    throw new Error(`오디오 검수 스캔 중 에러 발생: ${err.message}`);
  }
}

module.exports = {
  analyzeAudio,
  analyzeAudioPCM
};
