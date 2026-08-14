// Pasos 1-4 del check-in: declaración de aptitud, una pregunta a la vez.
import { useState } from 'react'
import { APTITUDE_QUESTIONS } from '../lib/types'
import { Button, Card, Progress } from './ui'

export default function AptitudeWizard({
  onComplete,
}: {
  /** answers tiene 4 booleanos; apto = todos true */
  onComplete: (apto: boolean, answers: boolean[]) => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<boolean[]>([])

  const answer = (yes: boolean) => {
    const next = [...answers, yes]
    if (!yes) {
      onComplete(false, next)
      return
    }
    if (next.length === APTITUDE_QUESTIONS.length) {
      onComplete(true, next)
    } else {
      setAnswers(next)
      setStep(step + 1)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="t-caption">Declaración de aptitud</span>
        <span className="t-footnote tnum">{step + 1} / {APTITUDE_QUESTIONS.length}</span>
      </div>
      <Progress value={((step) / APTITUDE_QUESTIONS.length) * 100} />
      <Card className="mt-6 text-center py-10 px-6">
        <p className="t-title" style={{ textWrap: 'balance' }}>{APTITUDE_QUESTIONS[step]}</p>
      </Card>
      <div className="grid grid-cols-2 gap-3 mt-6">
        <Button variant="secondary" onClick={() => answer(false)}>No</Button>
        <Button onClick={() => answer(true)}>Sí, declaro</Button>
      </div>
      <p className="t-footnote text-center mt-4">
        Esta declaración queda registrada con fecha, hora y tu firma.
      </p>
    </div>
  )
}
