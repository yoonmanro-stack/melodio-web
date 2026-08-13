# 【개발자 지침서 v3.0】 HexaWave DB 스키마 & eNFC API 연동 스펙 명세서
**추천 파일명**: `hexawave-db-api-developer-specs-v5.md`
**대상 에이전트**: Antigravity 백엔드 및 DB 운영팀 (PostgreSQL/PostGIS, Node.js/TypeScript Express 개발용)

---

## 1. 아키텍처 개요 (Architecture Overview)

본 시스템은 오프라인 공간의 무결성을 입증하기 위해 수립된 **[Spot(2.5m) ➔ CELL(7m) ➔ Space(대공간)]** 삼단 계층형 공간 데이터베이스 설계 구조를 충족한다. 특히 CELL(상업 매장/테넌트) 및 Space의 하위 영역을 형성하는 H3 Res 13 모듈 묶음(Clustering)은 물리적 면적과 사용자의 범위 조율 스위치(Dynamic Ring Radius Control)에 따라 **k-Ring = 1(7개), 2(19개), 3(37개), 4(61개), 5(91개), 6(127개), 10(331개), 20(1,261개), 30(2,791개), 50(7,651개), 100(30,301개)** 레벨로 유동적으로 팽창 및 수축하며, 해수욕장 백사장 및 올림픽공원 같은 초대형 광역 아웃도어 공간을 완벽히 수용하도록 설계된다. 백엔드는 우버의 `H3` 격자 인덱스를 하부 엔진(Index)으로 채택하며, 클라이언트의 온디바이스 보안 영역(Secure Enclave/StrongBox)에서 서명된 WebAuthn 토큰 및 다중 RAW 센서값(기압계, 나침반, 자이로)을 융합 연산하여 초정밀 오프라인 현장 존재 증명(eNFC)을 0.1초 내에 검증 및 락인한다.

---

## 2. PostgreSQL / PostGIS DDL 스키마 명세 (Database DDL Specifications)

```sql
-- [0] PostGIS 및 공간 쿼리 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;

-- [1] spaces: 최상위 대공간 마스터 테이블 (인천공항, 스타필드, 성수동 팝업 등)
CREATE TABLE spaces (
    id VARCHAR(64) PRIMARY KEY, -- 고유 UUID v4
    name VARCHAR(255) NOT NULL, -- 대공간명 (예: '인천공항 제2여객터미널', '성수동 연무장길')
    description TEXT, -- 공간 물리 설명
    sovereign_flag_id VARCHAR(64), -- 공간 점령 마스터 영주 깃발 ID
    geom GEOMETRY(Polygon, 4326), -- 대공간 공식 지적도/지도 폴리곤 경계선 (WGS84)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [2] place_cells: 서비스 운영 최소 단위 상업 매장 테이블 (스타벅스, 올리브영 등)
CREATE TABLE place_cells (
    id VARCHAR(64) PRIMARY KEY, -- 고유 UUID v4
    space_id VARCHAR(64) REFERENCES spaces(id) ON DELETE SET NULL, -- 부모 대공간 ID
    name VARCHAR(255) NOT NULL, -- 매장명/테넌트명 (예: '스타벅스 인천공항T2점')
    category VARCHAR(50) NOT NULL, -- 카테고리 (카페, 음식점, 캠핑장 등)
    cell_tier INT DEFAULT 1, -- 보상 배율 차등화를 위한 등급 (1: Common ~ 4: Legend)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [3] place_cell_h3_mappings: H3 Res 13 (7m) 격자 모듈의 1:N 매핑 테이블 (부동산 필지 묶음 구조)
CREATE TABLE place_cell_h3_mappings (
    h3_index_id VARCHAR(16) PRIMARY KEY, -- Uber H3 Resolution 13 Hexagon Index ID (64bit 16진수)
    place_cell_id VARCHAR(64) REFERENCES place_cells(id) ON DELETE CASCADE, -- 소유한 PLACE CELL ID
    is_center BOOLEAN DEFAULT FALSE, -- 중심 격자(k=0) 여부
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [4] spots: 최소단위 정밀 유틸리티 자산 및 안심보호 노드 테이블 (🚻 화장실, 🔑 라커, 💱 환전소 등)
CREATE TABLE spots (
    id VARCHAR(64) PRIMARY KEY, -- 고유 UUID v4
    place_cell_id VARCHAR(64) REFERENCES place_cells(id) ON DELETE CASCADE, -- 소유한 부모 매장 CELL ID (내부/외부 매핑)
    name VARCHAR(255) NOT NULL, -- 자산명 (예: '스타벅스 카운터 우측 무인 락커')
    category_type VARCHAR(50) NOT NULL, -- 자산 카테고리 기호 (🚻, 🔑, 💱, '안심 펜던트', '포토존')
    h3_index_r14 VARCHAR(16) NOT NULL, -- Uber H3 Resolution 14 Hexagon Index ID (지름 2.5m 최소 격자 주소)
    representative_photo_url VARCHAR(512), -- 자산 대표 현장 이미지 CDN 주소
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT(소셜 검증 대기), ACTIVE(정식 노출 활성)
    pioneer_user_id VARCHAR(64) NOT NULL, -- 최초 스팟 개척 및 등록자 ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [5] flags: Spot Fingerprint(공간 지문)의 암호화 무결성 및 RAW 센서 융합 영구 보존 테이블
CREATE TABLE flags (
    id VARCHAR(64) PRIMARY KEY, -- 고유 UUID v4
    spot_id VARCHAR(64) REFERENCES spots(id) ON DELETE CASCADE, -- 해당 공간 핀포인트 ID
    user_id VARCHAR(64) NOT NULL, -- 인증/개척 요청자 ID
    representative_photo_url VARCHAR(512) NOT NULL, -- 실시간 라이브 카메라 direct 업로드 CDN 이미지
    compass_heading_deg NUMERIC(5, 2) NOT NULL, -- 촬영 시점 단말기 나침반 방위 동기화 각도 (0.00 ~ 359.99도)
    device_pitch NUMERIC(5, 2) NOT NULL, -- 촬영 시점 단말기 Pitch 자이로각 (-90.00 ~ 90.00도)
    device_roll NUMERIC(5, 2) NOT NULL, -- 촬영 시점 단말기 Roll 자이로각 (-180.00 ~ 180.00도)
    estimated_height_m NUMERIC(5, 2) NOT NULL, -- 가속도/모션 센서 기반 융합 렌즈 수평 지면 높이 (m)
    barometer_altitude_m NUMERIC(7, 2) NOT NULL, -- 내장 기압계 기반 실측 해발 고도 (Z축)
    webauthn_sign_token TEXT NOT NULL, -- Secure Enclave/StrongBox 암호화 일회성 검증 서명값
    is_verified BOOLEAN DEFAULT FALSE, -- 3인 이상 다자간 소셜 교차 검증(Social Proof) 완료 플래그
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [6] contents: 방문자들의 방문 후기, 3D LP 해금 이력 및 경험 축적 테이블
CREATE TABLE contents (
    id VARCHAR(64) PRIMARY KEY, -- 고유 UUID v4
    spot_id VARCHAR(64) REFERENCES spots(id) ON DELETE CASCADE,
    visitor_user_id VARCHAR(64) NOT NULL,
    review_text TEXT,
    photo_url VARCHAR(512),
    confidence_score NUMERIC(5, 2) NOT NULL, -- 해당 진입의 eNFC 가중치 융합 평가 점수 (최소 90점 이상 승인)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [7] nfc_tags: 무배터리 실물 하드웨어 안심 펜던트 및 링 고유 식별 매핑 테이블
CREATE TABLE nfc_tags (
    nfc_tag_id VARCHAR(64) PRIMARY KEY, -- 스틸/에폭시 NTAG424 DNA 복제불가 하드웨어 고유 UID
    spot_id VARCHAR(64) REFERENCES spots(id) ON DELETE SET NULL, -- 연동된 공간 스팟 ID (아동/반려동물/치매노인)
    tag_name VARCHAR(100) NOT NULL, -- 예: '하조대 댕댕이 펜던트 #04'
    guardian_user_id VARCHAR(64) NOT NULL, -- 보호자 고유 식별자 ID
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, LOST, BLOCKED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [8] guardian_050_mappings: 스마트 자산(댕댕이/아동) NFC 태깅 시 발견자와 보호자를 연동하는 가상번호 풀 라우팅 테이블
CREATE TABLE guardian_050_mappings (
    id SERIAL PRIMARY KEY,
    nfc_tag_id VARCHAR(64) REFERENCES nfc_tags(nfc_tag_id) ON DELETE CASCADE, -- 태깅된 하드웨어 ID
    virtual_050_number VARCHAR(20) NOT NULL, -- 동적 050 번호 풀에서 30분 임시 바인딩된 번호
    guardian_real_phone VARCHAR(20) NOT NULL, -- 암호화 격리된 보호자 실제 전화번호
    webrtc_session_id VARCHAR(128), -- WebRTC P2P 음성 통화 시그널링 세션 키
    expires_at TIMESTAMP NOT NULL, -- 30분 경과 시 자동 파기 및 050 번호 Pool 반환 기한
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [9] 고속 인덱스 생성
CREATE INDEX idx_place_cell_h3 ON place_cell_h3_mappings (h3_index_id);
CREATE INDEX idx_spots_h3_r14 ON spots (h3_index_r14);
CREATE INDEX idx_spaces_geom ON spaces USING GIST (geom);
CREATE INDEX idx_guardian_050_expiry ON guardian_050_mappings (expires_at);
```
