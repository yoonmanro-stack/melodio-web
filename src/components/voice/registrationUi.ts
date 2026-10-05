type RegistrationState = { status: string; errorCode?: string };

export const REGISTRATION_STEPS = ['목소리 샘플', '본인 확인 녹음', '검증·저장'] as const;

/** Step completion means the input was submitted, not that identity was verified. */
export function registrationPresentation(status?: string, validationPhrase?: string): {
  step: 1 | 2 | 3;
  title: string;
  description: string;
} {
  if (status === 'phrase_ready') return {
    step: 2,
    title: '본인 목소리 확인',
    description: '샘플을 제출한 사람이 아래 문구를 읽어 주세요. 이 녹음으로 본인 목소리인지 확인합니다.',
  };
  if (['voice_submitting', 'voice_pending', 'availability_pending'].includes(status || '')) return {
    step: 3,
    title: '본인 확인 및 목소리 저장 중',
    description: '제출한 샘플과 검증 녹음을 확인하고 있습니다. 검증을 통과하면 내 음색 스타일에 저장됩니다.',
  };
  if (status === 'ready') return {
    step: 3,
    title: '목소리 저장 완료',
    description: '본인 확인을 마친 목소리를 내 음색 스타일에서 사용할 수 있습니다.',
  };
  if (['validation_submitting', 'validation_pending'].includes(status || '')) return {
    step: 1,
    title: '목소리 샘플 확인 중',
    description: '업로드한 샘플을 확인하고 있습니다. 준비가 끝나면 본인 확인용 문구가 표시됩니다.',
  };
  if (status === 'failed') return {
    step: validationPhrase ? 3 : 1,
    title: '목소리 등록 상태 확인',
    description: '아래 안내에서 처리 결과를 확인해 주세요. 아직 목소리가 저장된 상태는 아닙니다.',
  };
  if (status === 'draft') return {
    step: 1,
    title: '목소리 샘플 업로드 확인',
    description: '샘플 제출을 완료하지 못했습니다. 입력 내용과 선택 구간을 확인해 주세요.',
  };
  return {
    step: 1,
    title: '목소리 샘플 업로드',
    description: '내 목소리 샘플을 먼저 제출하세요. 다음 단계에서 안내 문구를 읽어 본인 확인을 진행합니다.',
  };
}

const RESUMABLE_STATUSES = new Set([
  "validation_submitting", "validation_pending", "phrase_ready",
  "voice_submitting", "voice_pending", "availability_pending",
]);

// Confirmed terminal failures remain history. An unreadable submission response
// is still held because a provider task may exist without a recoverable task ID.
export function restoreRegistration<T extends RegistrationState>(registrations: T[]): T | null {
  return registrations.find((registration) => RESUMABLE_STATUSES.has(registration.status))
    ?? registrations.find((registration) => registration.status === "failed" && registration.errorCode === "provider_result_unrecognized")
    ?? null;
}

type FailureGuidance = {
  title: string;
  detail: string;
  canStartNew: boolean;
};

export function failureGuidance(errorCode?: string, validationPhrase?: string): FailureGuidance {
  if (errorCode === "provider_internal_error") {
    return {
      title: "목소리 검증 서비스에서 오류가 발생했습니다",
      detail: "공급자 내부 처리 오류로 요청을 완료하지 못했습니다. 이 오류만으로 녹음 품질에 문제가 있다고 판단할 수 없습니다. 자동으로 다시 요청되지 않습니다. 등록 ID로 서비스 상태를 확인해 주세요.",
      canStartNew: true,
    };
  }
  if (errorCode === "provider_auth_error" || errorCode === "provider_billing_error") {
    return {
      title: "목소리 검증 서비스 설정 확인이 필요합니다",
      detail: errorCode === "provider_auth_error"
        ? "공급자가 인증 또는 모델 접근 권한 오류를 반환했습니다. 서비스의 API 키와 모델 권한을 확인해야 합니다. 녹음을 다시 제출하기 전에 등록 ID로 상태를 문의해 주세요."
        : "공급자가 결제 또는 크레딧 오류를 반환했습니다. 서비스 계정의 결제 상태를 확인해야 합니다. 녹음을 다시 제출하기 전에 등록 ID로 상태를 문의해 주세요.",
      canStartNew: true,
    };
  }
  if (errorCode === "provider_result_unrecognized") {
    return {
      title: "목소리 검증 서비스 결과를 확인하고 있습니다",
      detail: "공급자 응답 형식을 확인할 수 없어 성공이나 실패로 확정하지 않았습니다. 기존 작업을 유지하며 새 요청을 만들지 않습니다. 새로 등록하지 말고 등록 ID로 상태를 확인해 주세요.",
      canStartNew: false,
    };
  }
  if (errorCode === "validation_failed") {
    return {
      title: "검증 문구를 만들지 못했습니다",
      detail: "검증이 실패로 확인되어 읽을 문구가 제공되지 않았습니다. 실패 원인은 아직 확인되지 않았습니다. 이 작업은 자동으로 다시 요청되지 않습니다. 등록 ID로 상태를 문의할 수 있습니다.",
      canStartNew: true,
    };
  }
  if (errorCode === "validation_submission_unconfirmed" || (errorCode === "submission_unconfirmed" && !validationPhrase)) {
    return {
      title: "검증 문구 요청 결과를 확인할 수 없습니다",
      detail: "검증 문구가 표시되지 않았습니다. 이전 요청의 Kie 접수 여부가 불확실해 자동 재요청하지 않았습니다. 등록 ID로 상태를 문의할 수 있습니다. 새로 등록하면 별도 요청이며 비용이 다시 발생할 수 있습니다.",
      canStartNew: true,
    };
  }
  if (errorCode === "validation_submission_held") {
    return {
      title: "검증 문구 요청이 보류되었습니다",
      detail: "검증 문구가 표시되지 않았습니다. 이번 요청은 Kie에 보내기 전에 보류됐고 자동 재요청하지 않았습니다. 등록 ID로 이전 요청의 상태를 문의할 수 있습니다. 새로 등록하면 별도 요청입니다.",
      canStartNew: true,
    };
  }
  if (errorCode === "voice_creation_failed") {
    return {
      title: "목소리 등록에 실패했습니다",
      detail: "검증 문구 녹음 제출 후 목소리 생성이 실패로 확인되었습니다. 자동으로 다시 요청되지 않습니다. 새로 등록하면 새로운 요청이 시작됩니다.",
      canStartNew: true,
    };
  }
  if (errorCode === "voice_unavailable") {
    return {
      title: "Suno V6에서 사용할 수 없는 목소리입니다",
      detail: "등록 결과를 확인했지만 Suno V6에서 사용할 수 없습니다. 새로 등록하면 새로운 요청이 시작됩니다.",
      canStartNew: true,
    };
  }
  return {
    title: "등록 상태를 확인할 수 없습니다",
    detail: "요청 접수 또는 처리 결과가 확인되지 않아 자동 재요청하지 않았습니다. 등록 ID로 상태를 문의할 수 있습니다. 새로 등록하면 별도 요청이며 비용이 다시 발생할 수 있습니다.",
    canStartNew: true,
  };
}
