/// <reference types="vite/client" />

interface TranslatorInstance {
  translate(text: string): Promise<string>
}

interface TranslatorFactory {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>
}

interface Window {
  Translator?: TranslatorFactory
}
