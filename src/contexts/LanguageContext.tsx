"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "ko" | "en" | "ja" | "es" | "fr" | "de" | "pt" | "zh" | "it" | "hi";

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  ko: {
    "Dashboard": "대시보드",
    "Artist Incubator": "아티스트 인큐베이터",
    "Persona Lab": "아티스트 페르소나",
    "아티스트 페르소나": "아티스트 페르소나",
    "Audio Forge Pro": "뮤직 스튜디오",
    "Audio Forge": "뮤직 스튜디오",
    "뮤직 스튜디오": "뮤직 스튜디오",
    "Preset Studio": "프리셋 스튜디오",
    "프리셋 스튜디오": "프리셋 스튜디오",
    "Style Library": "뮤직 스튜디오",
    "Channel Builder": "유튜브 채널 빌더",
    "유튜브 채널 빌더": "유튜브 채널 빌더",
    "Viral & Trend Zone": "바이럴 숏폼 스튜디오",
    "바이럴 숏폼 스튜디오": "바이럴 숏폼 스튜디오",
    "Japan BGM Forge": "일본 BGM 스튜디오",
    "일본 BGM 스튜디오": "일본 BGM 스튜디오",
    "Longform Studio": "롱폼 영상 스튜디오",
    "롱폼 영상 스튜디오": "롱폼 영상 스튜디오",
    "Voice Studio": "보컬 음색 스타일",
    "VoiceDNA Studio": "보컬 음색 스타일",
    "보이스 스튜디오": "보컬 음색 스타일",
    "보컬 음색 스타일": "보컬 음색 스타일",
    "YouTube Auto-Pilot": "유튜브 자동 발행 (Auto-Pilot)",
    "YouTube Analytics": "채널 분석 (Analytics)",
    "IP & License Vault": "음원 라이선스 보관함",
    "Distribution": "음원 유통 & 발매",
    "Help Center & FAQ": "고객센터 & FAQ",
    "Settings": "설정",
    "Billing & Subscription": "결제 및 요금제",
    "Generate": "생성하기",
    "Save": "저장",
    "Cancel": "취소",
    "Edit": "수정",
    "Concept & Topic": "컨셉 및 주제",
    "Genre": "장르",
    "Lyrics": "가사",
    "Style Prompt": "스타일 프롬프트",
    "Instrumental": "연주곡",
    "Log Out": "로그아웃"
  },
  en: {
    "Dashboard": "Dashboard",
    "Artist Incubator": "Artist Incubator",
    "Persona Lab": "Persona Lab",
    "Style Library": "Style Library",
    "Audio Forge": "Audio Forge",
    "Viral & Trend Zone": "Viral & Trend Zone",
    "Japan BGM Forge": "Japan BGM Forge",
    "Longform Studio": "Longform Studio",
    "Voice Studio": "Vocal Tone Style (Prompt-Based)",
    "VoiceDNA Studio": "Vocal Tone Style (Prompt-Based)",
    "YouTube Auto-Pilot": "YouTube Auto-Pilot",
    "YouTube Analytics": "YouTube Analytics",
    "IP & License Vault": "IP & License Vault",
    "Distribution": "Distribution",
    "Help Center & FAQ": "Help Center & FAQ",
    "Settings": "Settings",
    "Billing & Subscription": "Billing & Subscription",
    "Generate": "Generate",
    "Save": "Save",
    "Cancel": "Cancel",
    "Edit": "Edit",
    "Concept & Topic": "Concept & Topic",
    "Genre": "Genre",
    "Lyrics": "Lyrics",
    "Style Prompt": "Style Prompt",
    "Instrumental": "Instrumental",
    "Log Out": "Log Out"
  },
  ja: {
    "Dashboard": "ダッシュボード",
    "Artist Incubator": "アーティスト育成",
    "Persona Lab": "ペルソナラボ",
    "Style Library": "スタイルライブラリ",
    "Audio Forge": "オーディオフォージ",
    "Viral & Trend Zone": "バイラル＆トレンド",
    "Japan BGM Forge": "和風BGM制作",
    "Longform Studio": "ロングフォームスタジオ",
    "Voice Studio": "ボーカル音色スタイル（プロンプトベース）",
    "VoiceDNA Studio": "ボーカル音色スタイル（プロンプトベース）",
    "YouTube Auto-Pilot": "YouTubeオートパイロット",
    "YouTube Analytics": "YouTube分析",
    "IP & License Vault": "IP＆ライセンス金庫",
    "Distribution": "配信・リリース",
    "Help Center & FAQ": "ヘルプ＆FAQ",
    "Settings": "設定",
    "Billing & Subscription": "プラン・お支払い",
    "Generate": "生成する",
    "Save": "保存",
    "Cancel": "キャンセル",
    "Edit": "編集",
    "Concept & Topic": "コンセプト＆トピック",
    "Genre": "ジャンル",
    "Lyrics": "歌詞",
    "Style Prompt": "スタイルプロンプト",
    "Instrumental": "インストゥルメンタル",
    "Log Out": "ログアウト"
  },
  es: {
    "Dashboard": "Panel de Control",
    "Artist Incubator": "Incubadora de Artistas",
    "Persona Lab": "Laboratorio de Persona",
    "Style Library": "Biblioteca de Estilos",
    "Audio Forge": "Forja de Audio",
    "Viral & Trend Zone": "Zona Viral y Tendencias",
    "Japan BGM Forge": "Forja de BGM Japonesa",
    "Longform Studio": "Estudio de Largo Formato",
    "Voice Studio": "Estilo de tono vocal (basado en prompts)",
    "VoiceDNA Studio": "Estilo de tono vocal (basado en prompts)",
    "YouTube Auto-Pilot": "Piloto Automático de YT",
    "YouTube Analytics": "Análisis de YouTube",
    "IP & License Vault": "Bóveda de IP y Licencias",
    "Distribution": "Distribución",
    "Help Center & FAQ": "Centro de Ayuda y FAQ",
    "Settings": "Ajustes",
    "Billing & Subscription": "Facturación y Suscripción",
    "Generate": "Generar",
    "Save": "Guardar",
    "Cancel": "Cancelar",
    "Edit": "Editar",
    "Concept & Topic": "Concepto y Tema",
    "Genre": "Género",
    "Lyrics": "Letra",
    "Style Prompt": "Indicación de Estilo",
    "Instrumental": "Instrumental",
    "Log Out": "Cerrar Sesión"
  },
  fr: {
    "Dashboard": "Tableau de Bord",
    "Artist Incubator": "Incubateur d'Artistes",
    "Persona Lab": "Labo de Persona",
    "Style Library": "Bibliothèque de Styles",
    "Audio Forge": "Forge Audio",
    "Viral & Trend Zone": "Zone Virale & Tendances",
    "Japan BGM Forge": "Forge BGM Japonaise",
    "Longform Studio": "Studio Long Format",
    "Voice Studio": "Style de timbre vocal (basé sur des prompts)",
    "VoiceDNA Studio": "Style de timbre vocal (basé sur des prompts)",
    "YouTube Auto-Pilot": "Pilote Automatique YT",
    "YouTube Analytics": "Analyses YouTube",
    "IP & License Vault": "Coffre-fort IP & Licence",
    "Distribution": "Distribution",
    "Help Center & FAQ": "Centre d'Aide & FAQ",
    "Settings": "Paramètres",
    "Billing & Subscription": "Facturation & Abonnement",
    "Generate": "Générer",
    "Save": "Enregistrer",
    "Cancel": "Annuler",
    "Edit": "Modifier",
    "Concept & Topic": "Concept & Sujet",
    "Genre": "Genre",
    "Lyrics": "Paroles",
    "Style Prompt": "Invite de Style",
    "Instrumental": "Instrumental",
    "Log Out": "Se Déconnecter"
  },
  de: {
    "Dashboard": "Dashboard",
    "Artist Incubator": "Künstler-Inkubator",
    "Persona Lab": "Persona-Labor",
    "Style Library": "Stil-Bibliothek",
    "Audio Forge": "Audio-Schmiede",
    "Viral & Trend Zone": "Viral- & Trend-Zone",
    "Japan BGM Forge": "Japanische BGM-Schmiede",
    "Longform Studio": "Langform-Studio",
    "Voice Studio": "Gesangsklang-Stil (promptbasiert)",
    "VoiceDNA Studio": "Gesangsklang-Stil (promptbasiert)",
    "YouTube Auto-Pilot": "YouTube Auto-Pilot",
    "YouTube Analytics": "YouTube-Analysen",
    "IP & License Vault": "IP- & Lizenz-Tresor",
    "Distribution": "Vertrieb",
    "Help Center & FAQ": "Hilfe-Center & FAQ",
    "Settings": "Einstellungen",
    "Billing & Subscription": "Abrechnung & Abo",
    "Generate": "Generieren",
    "Save": "Speichern",
    "Cancel": "Abbrechen",
    "Edit": "Bearbeiten",
    "Concept & Topic": "Konzept & Thema",
    "Genre": "Genre",
    "Lyrics": "Songtext",
    "Style Prompt": "Stil-Prompt",
    "Instrumental": "Instrumental",
    "Log Out": "Abmelden"
  },
  pt: {
    "Dashboard": "Painel de Controle",
    "Artist Incubator": "Incubadora de Artistas",
    "Persona Lab": "Laboratório de Persona",
    "Style Library": "Biblioteca de Estilos",
    "Audio Forge": "Forja de Áudio",
    "Viral & Trend Zone": "Zona Viral e Tendências",
    "Japan BGM Forge": "Forja de BGM Japonesa",
    "Longform Studio": "Estúdio de Longo Formato",
    "Voice Studio": "Estilo de timbre vocal (baseado em prompt)",
    "VoiceDNA Studio": "Estilo de timbre vocal (baseado em prompt)",
    "YouTube Auto-Pilot": "Piloto Automático de YT",
    "YouTube Analytics": "Análise do YouTube",
    "IP & License Vault": "Cofre de IP e Licenças",
    "Distribution": "Distribuição",
    "Help Center & FAQ": "Central de Ajuda e FAQ",
    "Settings": "Configurações",
    "Billing & Subscription": "Faturamento e Assinatura",
    "Generate": "Gerar",
    "Save": "Salvar",
    "Cancel": "Cancelar",
    "Edit": "Editar",
    "Concept & Topic": "Conceito e Tema",
    "Genre": "Gênero",
    "Lyrics": "Letra",
    "Style Prompt": "Prompt de Estilo",
    "Instrumental": "Instrumental",
    "Log Out": "Sair"
  },
  zh: {
    "Dashboard": "控制台",
    "Artist Incubator": "艺术家孵化器",
    "Persona Lab": "角色实验室",
    "Style Library": "风格库",
    "Audio Forge": "音频工坊",
    "Viral & Trend Zone": "热门与趋势区",
    "Japan BGM Forge": "日系BGM工坊",
    "Longform Studio": "长视频工作室",
    "Voice Studio": "人声音色风格（基于提示词）",
    "VoiceDNA Studio": "人声音色风格（基于提示词）",
    "YouTube Auto-Pilot": "YouTube自动驾驶",
    "YouTube Analytics": "YouTube数据分析",
    "IP & License Vault": "IP与授权金库",
    "Distribution": "分发与发行",
    "Help Center & FAQ": "帮助中心与常见问题",
    "Settings": "设置",
    "Billing & Subscription": "账单与订阅",
    "Generate": "生成",
    "Save": "保存",
    "Cancel": "取消",
    "Edit": "编辑",
    "Concept & Topic": "概念与主题",
    "Genre": "流派",
    "Lyrics": "歌词",
    "Style Prompt": "风格提示词",
    "Instrumental": "纯音乐",
    "Log Out": "登出"
  },
  it: {
    "Dashboard": "Dashboard",
    "Artist Incubator": "Incubatore Artisti",
    "Persona Lab": "Laboratorio Persona",
    "Style Library": "Libreria di Stili",
    "Audio Forge": "Forgia Audio",
    "Viral & Trend Zone": "Zona Virale e Tendenze",
    "Japan BGM Forge": "Forgia BGM Giapponese",
    "Longform Studio": "Studio Lungo Formato",
    "Voice Studio": "Stile timbrico vocale (basato su prompt)",
    "VoiceDNA Studio": "Stile timbrico vocale (basato su prompt)",
    "YouTube Auto-Pilot": "Pilota Automatico YT",
    "YouTube Analytics": "Analisi YouTube",
    "IP & License Vault": "Cassaforte IP e Licenze",
    "Distribution": "Distribuzione",
    "Help Center & FAQ": "Centro Assistenza e FAQ",
    "Settings": "Impostazioni",
    "Billing & Subscription": "Fatturazione e Abbonamento",
    "Generate": "Genera",
    "Save": "Salva",
    "Cancel": "Annulla",
    "Edit": "Modifica",
    "Concept & Topic": "Concetto e Argomento",
    "Genre": "Genere",
    "Lyrics": "Testo",
    "Style Prompt": "Prompt di Stile",
    "Instrumental": "Strumentale",
    "Log Out": "Disconnettersi"
  },
  hi: {
    "Dashboard": "डैशबोर्ड",
    "Artist Incubator": "कलाकार इनक्यूबेटर",
    "Persona Lab": "व्यक्तित्व लैब",
    "Style Library": "शैली लाइब्रेरी",
    "Audio Forge": "ऑडियो फोर्ज",
    "Viral & Trend Zone": "वायरल और ट्रेंड ज़ोन",
    "Japan BGM Forge": "जापानी बीजीएम फोर्ज",
    "Longform Studio": "लॉन्गफॉर्म स्टूडियो",
    "Voice Studio": "वोकल टोन शैली (प्रॉम्प्ट-आधारित)",
    "VoiceDNA Studio": "वोकल टोन शैली (प्रॉम्प्ट-आधारित)",
    "YouTube Auto-Pilot": "यूट्यूब ऑटो-पायलट",
    "YouTube Analytics": "यूट्यूब विश्लेषण",
    "IP & License Vault": "आईपी और लाइसेंस वॉल्ट",
    "Distribution": "वितरण",
    "Help Center & FAQ": "सहायता केंद्र और अक्सर पूछे जाने वाले प्रश्न",
    "Settings": "सेTINGS",
    "Billing & Subscription": "बिलिंग और सदस्यता",
    "Generate": "उत्पन्न करें",
    "Save": "सहेजें",
    "Cancel": "रद्द करें",
    "Edit": "संपादित करें",
    "Concept & Topic": "अवधारणा और विषय",
    "Genre": "शैली",
    "Lyrics": "गीत",
    "Style Prompt": "शैली प्रॉम्प्ट",
    "Instrumental": "इंस्ट्रूमेंटल",
    "Log Out": "लॉग आउट"
  }
};

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("ko");

  useEffect(() => {
    const saved = localStorage.getItem("melodio_lang") as Language;
    const validLanguages: Language[] = ["ko", "en", "ja", "es", "fr", "de", "pt", "zh", "it", "hi"];
    if (saved && validLanguages.includes(saved)) {
      setLanguageState(saved);
    } else {
      // Detect browser language
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith("ja")) {
        setLanguageState("ja");
      } else if (browserLang.startsWith("ko")) {
        setLanguageState("ko");
      } else if (browserLang.startsWith("es")) {
        setLanguageState("es");
      } else if (browserLang.startsWith("fr")) {
        setLanguageState("fr");
      } else if (browserLang.startsWith("de")) {
        setLanguageState("de");
      } else if (browserLang.startsWith("pt")) {
        setLanguageState("pt");
      } else if (browserLang.startsWith("zh")) {
        setLanguageState("zh");
      } else if (browserLang.startsWith("it")) {
        setLanguageState("it");
      } else if (browserLang.startsWith("hi")) {
        setLanguageState("hi");
      } else {
        setLanguageState("en");
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("melodio_lang", lang);
    // Dispatch a custom event to notify other components if needed
    window.dispatchEvent(new Event("melodio_lang_change"));
  };

  const t = (key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS["en"]?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
