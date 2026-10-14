/**
 * 核心数据类型定义
 */

/** 词性 */
export type PartOfSpeech =
  | 'n.'
  | 'v.'
  | 'adj.'
  | 'adv.'
  | 'prep.'
  | 'conj.'
  | 'pron.'
  | 'num.'
  | 'art.'
  | 'int.'

/** 释义条目：[词性, 中文释义]，词性可为空（用户自定义词库） */
export type Sense = [PartOfSpeech | '', string]