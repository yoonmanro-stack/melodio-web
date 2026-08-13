module.exports = {
  apps: [
    {
      // ─── 앱 식별 ──────────────────────────────────────────────────
      name: 'melodio-worker',
      script: 'index.js',
      cwd: '/Users/muse/melodio-worker',

      // ─── 프로세스 설정 ─────────────────────────────────────────────
      instances: 1,          // 워커는 1개만 (중복 처리 방지)
      autorestart: true,     // 충돌 시 자동 재시작
      watch: false,          // 파일 변경 감지 비활성 (프로덕션)
      max_memory_restart: '300M',

      // ─── 재시작 정책 ──────────────────────────────────────────────
      restart_delay: 5000,   // 재시작 전 5초 대기
      max_restarts: 10,      // 최대 재시작 횟수 (초과 시 stopped)

      // ─── 환경변수 ─────────────────────────────────────────────────
      env: {
        NODE_ENV: 'production',
        MOCK_MODE: 'false',  // demucs/ffmpeg 미설치 환경에서 Mock 파이프라인 가동
      },

      // ─── 로그 설정 ─────────────────────────────────────────────────
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      // ─── 유튜브 자율 스케줄러 프로세스 ─────────────────────────────
      name: 'melodio-youtube-scheduler',
      script: 'youtube_autopilot_worker.js',
      cwd: '/Users/muse/melodio-worker',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        MOCK_MODE: 'false',  // 실배포 테스트 시 'false'로 전환
      },
      log_file: './logs/scheduler_combined.log',
      out_file: './logs/scheduler_out.log',
      error_file: './logs/scheduler_error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      // ─── B2B 1시간 루프 백그라운드 워커 ─────────────────────────────
      name: 'melodio-b2b-loop-worker',
      script: 'b2b-loop-worker.js',
      cwd: '/Users/muse/melodio-worker',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        USE_MOCK_LYRIA: 'false',  // 실배포 시 'false'로 전환
      },
      log_file: './logs/b2b_combined.log',
      out_file: './logs/b2b_out.log',
      error_file: './logs/b2b_error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    }
  ],
};
