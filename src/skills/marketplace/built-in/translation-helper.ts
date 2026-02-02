import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface TranslationState {
  history: Array<{
    original: string;
    translated: string;
    fromLang: string;
    toLang: string;
    timestamp: Date;
  }>;
}

const state: TranslationState = {
  history: []
};

const languages: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  ru: 'Russian',
  hi: 'Hindi',
  nl: 'Dutch',
  sv: 'Swedish',
  pl: 'Polish'
};

function detectLanguage(text: string): string {
  const patterns: Record<string, RegExp[]> = {
    es: [/\b(el|la|los|las|de|en|que|y|es|un|una)\b/gi, /[ñáéíóú]/g],
    fr: [/\b(le|la|les|de|et|est|un|une|que|qui)\b/gi, /[àâçéèêëîïôùûü]/g],
    de: [/\b(der|die|das|und|ist|ein|eine|auf|zu)\b/gi, /[äöüß]/g],
    it: [/\b(il|la|di|che|e|un|una|per|sono)\b/gi, /[àèéìòù]/g],
    pt: [/\b(o|a|os|as|de|que|e|um|uma|em)\b/gi, /[ãõáéíóú]/g],
    zh: [/[\u4e00-\u9fff]/g],
    ja: [/[\u3040-\u309f\u30a0-\u30ff]/g],
    ko: [/[\uac00-\ud7af]/g],
    ar: [/[\u0600-\u06ff]/g],
    ru: [/[\u0400-\u04ff]/g]
  };

  let maxScore = 0;
  let detectedLang = 'en';

  for (const [lang, regexes] of Object.entries(patterns)) {
    let score = 0;
    regexes.forEach(regex => {
      const matches = text.match(regex);
      if (matches) score += matches.length;
    });
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

function simulateTranslation(text: string, fromLang: string, toLang: string): string {
  if (fromLang === toLang) return text;
  
  const translations: Record<string, Record<string, string>> = {
    'hello': { es: 'hola', fr: 'bonjour', de: 'hallo', it: 'ciao', pt: 'olá' },
    'goodbye': { es: 'adiós', fr: 'au revoir', de: 'auf wiedersehen', it: 'arrivederci', pt: 'adeus' },
    'thank you': { es: 'gracias', fr: 'merci', de: 'danke', it: 'grazie', pt: 'obrigado' },
    'yes': { es: 'sí', fr: 'oui', de: 'ja', it: 'sì', pt: 'sim' },
    'no': { es: 'no', fr: 'non', de: 'nein', it: 'no', pt: 'não' },
    'please': { es: 'por favor', fr: 's\'il vous plaît', de: 'bitte', it: 'per favore', pt: 'por favor' },
    'good morning': { es: 'buenos días', fr: 'bonjour', de: 'guten morgen', it: 'buongiorno', pt: 'bom dia' },
    'good night': { es: 'buenas noches', fr: 'bonne nuit', de: 'gute nacht', it: 'buonanotte', pt: 'boa noite' },
    'how are you': { es: '¿cómo estás?', fr: 'comment allez-vous?', de: 'wie geht es dir?', it: 'come stai?', pt: 'como está?' }
  };

  const lowerText = text.toLowerCase();
  for (const [en, trans] of Object.entries(translations)) {
    if (lowerText === en && toLang in trans) {
      return trans[toLang as keyof typeof trans];
    }
  }

  return '[Translation of "' + text + '" to ' + languages[toLang] + ']';
}

export const translationHelper: BuiltInSkill = {
  id: 'translation-helper',
  name: 'Translation Helper',
  description: 'Break language barriers with instant translations. Support for 15+ languages with automatic language detection.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '🌐',
  category: 'communication',
  installCount: 3654,
  rating: 4.5,
  commands: [
    {
      name: 'translate',
      description: 'Translate text to another language',
      usage: 'translate <text> to <language>',
      examples: ['translate "Hello world" to spanish', 'translate "Bonjour" to english']
    },
    {
      name: 'detect',
      description: 'Detect the language of text',
      usage: 'translate detect <text>',
      examples: ['translate detect "Bonjour le monde"']
    },
    {
      name: 'languages',
      description: 'List supported languages',
      usage: 'translate languages',
      examples: ['translate languages']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'translate': {
        const fullText = Object.values(params).join(' ');
        const toMatch = fullText.match(/(.+)\s+to\s+(\w+)$/i);
        
        if (!toMatch) {
          return {
            success: false,
            message: 'Please specify target language. Usage: translate <text> to <language>'
          };
        }

        let text = toMatch[1].replace(/^["']|["']$/g, '').trim();
        const targetLang = toMatch[2].toLowerCase();

        const langCode = Object.entries(languages).find(
          ([code, name]) => name.toLowerCase() === targetLang || code === targetLang
        )?.[0];

        if (!langCode) {
          return {
            success: false,
            message: 'Unsupported language: ' + targetLang + '\n\nUse "translate languages" to see supported languages.'
          };
        }

        const sourceLang = detectLanguage(text);
        const translated = simulateTranslation(text, sourceLang, langCode);

        state.history.push({
          original: text,
          translated,
          fromLang: sourceLang,
          toLang: langCode,
          timestamp: new Date()
        });

        return {
          success: true,
          message: '🌐 TRANSLATION\n\n' +
            'From: ' + languages[sourceLang] + ' (' + sourceLang + ')\n' +
            'To: ' + languages[langCode] + ' (' + langCode + ')\n\n' +
            'Original:\n"' + text + '"\n\n' +
            'Translated:\n"' + translated + '"\n\n' +
            'Note: Connect to a translation API for accurate translations.'
        };
      }

      case 'detect': {
        const text = Object.values(params).join(' ').replace(/^["']|["']$/g, '');
        
        if (!text) {
          return {
            success: false,
            message: 'Please provide text to analyze. Usage: translate detect <text>'
          };
        }

        const detected = detectLanguage(text);
        const confidence = text.length > 20 ? 'High' : text.length > 10 ? 'Medium' : 'Low';

        return {
          success: true,
          message: '🔍 LANGUAGE DETECTION\n\n' +
            'Text: "' + text.substring(0, 50) + (text.length > 50 ? '...' : '') + '"\n\n' +
            'Detected language: ' + languages[detected] + ' (' + detected + ')\n' +
            'Confidence: ' + confidence + '\n\n' +
            'Use "translate <text> to <language>" to translate.'
        };
      }

      case 'languages': {
        let langList = '🌐 SUPPORTED LANGUAGES\n\n';
        
        const langEntries = Object.entries(languages);
        for (let i = 0; i < langEntries.length; i += 2) {
          const left = langEntries[i][0] + ' - ' + langEntries[i][1];
          const right = langEntries[i + 1] ? langEntries[i + 1][0] + ' - ' + langEntries[i + 1][1] : '';
          langList += left.padEnd(20) + right + '\n';
        }

        langList += '\nUsage: translate <text> to <language>\n';
        langList += 'Example: translate "Hello" to spanish';

        return {
          success: true,
          message: langList
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: translate, detect, languages'
        };
    }
  }
};

export default translationHelper;
