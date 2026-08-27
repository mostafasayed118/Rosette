'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getQuizSessionId } from './session';
import { completeGiftFinder } from './actions';
import { GiftFinderResults } from './GiftFinderResults';
import type { GiftFinderOutcome, QuizAnswers } from './types';

type QuestionId = 'recipient' | 'occasion' | 'budget' | 'color' | 'style';

const QUESTIONS: Array<{ id: QuestionId; labelKey: string; options: Array<{ value: string; labelKey: string }> }> = [
  {
    id: 'recipient', labelKey: 'giftFinderQRecipient',
    options: [
      { value: 'partner', labelKey: 'giftFinderRecipientPartner' },
      { value: 'family', labelKey: 'giftFinderRecipientFamily' },
      { value: 'friend', labelKey: 'giftFinderRecipientFriend' },
      { value: 'colleague', labelKey: 'giftFinderRecipientColleague' },
    ],
  },
  {
    id: 'occasion', labelKey: 'giftFinderQOccasion',
    options: [
      { value: 'birthday', labelKey: 'celebration' },
      { value: 'love', labelKey: 'love' },
      { value: 'thank-you', labelKey: 'thankYou' },
      { value: 'new-home', labelKey: 'newHome' },
      { value: 'congratulations', labelKey: 'congratulations' },
      { value: 'sympathy', labelKey: 'sympathy' },
      { value: 'just-because', labelKey: 'giftFinderOccasionJustBecause' },
    ],
  },
  {
    id: 'budget', labelKey: 'giftFinderQBudget',
    options: [
      { value: 'under-150', labelKey: 'giftFinderBudgetUnder150' },
      { value: '150-250', labelKey: 'giftFinderBudget150-250' },
      { value: 'over-250', labelKey: 'giftFinderBudgetOver250' },
    ],
  },
  {
    id: 'color', labelKey: 'giftFinderQColor',
    options: [
      { value: 'red', labelKey: 'giftFinderColorRed' },
      { value: 'pink', labelKey: 'giftFinderColorPink' },
      { value: 'white', labelKey: 'giftFinderColorWhite' },
      { value: 'pastel', labelKey: 'giftFinderColorPastel' },
      { value: 'bright', labelKey: 'giftFinderColorBright' },
      { value: 'mixed', labelKey: 'giftFinderColorMixed' },
    ],
  },
  {
    id: 'style', labelKey: 'giftFinderQStyle',
    options: [
      { value: 'romantic', labelKey: 'giftFinderStyleRomantic' },
      { value: 'classic', labelKey: 'giftFinderStyleClassic' },
      { value: 'bold', labelKey: 'giftFinderStyleBold' },
      { value: 'minimal', labelKey: 'giftFinderStyleMinimal' },
      { value: 'playful', labelKey: 'giftFinderStylePlayful' },
    ],
  },
];

function toAnswers(q: QuestionId, value: string, current: QuizAnswers): QuizAnswers {
  return { ...current, [q]: value };
}

export function GiftFinderQuiz() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({ recipient: '', occasion: '', budget: '', color: '', style: '' });
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'loading' | 'done' | 'error'>('intro');
  const [outcome, setOutcome] = useState<GiftFinderOutcome | null>(null);

  const total = QUESTIONS.length;

  // Selecting a value auto-advances to the next question; on the final
  // question it fires the completion action instead.
  function choose(value: string) {
    const question = QUESTIONS[step]!;
    const next = toAnswers(question.id, value, answers);
    setAnswers(next);
    if (step + 1 >= total) {
      void run(next);
    } else {
      setStep(step + 1);
    }
  }

  async function run(finalAnswers: QuizAnswers) {
    setPhase('loading');
    try {
      const result = await completeGiftFinder(finalAnswers, getQuizSessionId());
      if (result === 'invalid') { setPhase('error'); return; }
      setOutcome(result);
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-tertiary">{t('giftFinderHomeEyebrow')}</p>
        <h1 className="font-display text-[40px] font-semibold leading-tight text-on-surface">{t('giftFinderIntroHeading')}</h1>
        <p className="mx-auto mt-4 max-w-md text-on-surface-variant">{t('giftFinderIntroLede')}</p>
        <Button className="mt-8 px-8 py-4 text-base" onClick={() => setPhase('quiz')}>{t('giftFinderStart')}</Button>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="mx-auto max-w-md py-24 text-center" role="status">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-on-surface-variant">{t('giftFinderAdding')}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-on-surface">{t('giftFinderError')}</p>
        <Button className="mt-6" onClick={() => setPhase('quiz')}>{t('giftFinderTryAgain')}</Button>
      </div>
    );
  }

  if (phase === 'done' && outcome) {
    return (
      <GiftFinderResults
        outcome={outcome}
        onRetake={() => {
          setAnswers({ recipient: '', occasion: '', budget: '', color: '', style: '' });
          setStep(0);
          setPhase('quiz');
        }}
      />
    );
  }

  const question = QUESTIONS[step]!;
  return (
    <div className="mx-auto max-w-2xl py-12">
      <p className="mb-2 text-sm text-on-surface-variant" role="status">{t('giftFinderStep', { step: step + 1, total })}</p>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
          <h1 className="mb-6 font-display text-3xl font-semibold text-on-surface">{t(question.labelKey)}</h1>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {question.options.map((opt) => (
              <button key={opt.value} type="button" onClick={() => choose(opt.value)} className="press cursor-pointer rounded-2xl border border-outline-variant/50 bg-surface p-4 text-left text-sm font-medium text-on-surface transition-all hover:border-primary hover:-translate-y-0.5">
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
          <div className="mt-8 flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>{t('giftFinderBack')}</Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
