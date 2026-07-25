import { useEffect, useMemo, useRef, useState } from 'react'
import mathJaxUrl from 'mathjax/es5/tex-mml-chtml.js?url'
import { createAssessmentAttempt, getAssessmentPack, parseAssessmentQuestion, type AssessmentQuestionContent, type AssessmentQuestionSelection } from '../models/Assessments'
import './ReadinessAssessment.css'

interface ReadinessAssessmentProps {
  courseId: string
  onClose: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

export function ReadinessAssessment({ courseId, onClose }: ReadinessAssessmentProps) {
  const pack = getAssessmentPack(courseId)
  const [attemptNumber, setAttemptNumber] = useState(0)
  const selections = useMemo(() => pack ? createAssessmentAttempt(courseId, pack, () => (Math.random() + attemptNumber / 997) % 1) : [], [attemptNumber, courseId, pack])
  const [questions, setQuestions] = useState<AssessmentQuestionContent[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const iframe = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(500)

  useEffect(() => {
    if (!pack) return
    const controller = new AbortController()
    setLoadState('loading')
    setQuestions([])
    Promise.all(selections.map(selection => fetch(selection.path, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error(`Unable to load ${selection.path}`)
      return response.text()
    }).then(parseAssessmentQuestion)))
      .then(loadedQuestions => {
        if (!controller.signal.aborted) {
          setQuestions(loadedQuestions)
          setLoadState('ready')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState('error')
      })
    return () => controller.abort()
  }, [pack, selections])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframe.current?.contentWindow || !isHeightMessage(event.data)) return
      setIframeHeight(Math.max(500, Math.min(event.data.height, 2400)))
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  if (!pack) return null
  const document = loadState === 'ready' ? buildAssessmentDocument(pack.title, pack.introduction, selections, questions) : undefined

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="assessment-modal" role="dialog" aria-modal="true" aria-labelledby="assessment-title" onMouseDown={event => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} type="button" aria-label="Back to course details">×</button>
      <p className="modal-kind">Optional self-evaluation</p>
      <h2 id="assessment-title">{pack.title}</h2>
      <p>{pack.introduction}</p>
      <div className="assessment-actions">
        <button type="button" onClick={() => setAttemptNumber(current => current + 1)}>Try another version</button>
        <span>Nothing here changes your schedule or enrollment.</span>
      </div>
      {loadState === 'loading' && <p className="assessment-status">Loading your questions…</p>}
      {loadState === 'error' && <div className="assessment-error"><p>We could not load this assessment right now.</p><button type="button" onClick={() => setAttemptNumber(current => current + 1)}>Try again</button></div>}
      {document && <iframe ref={iframe} className="assessment-frame" title={`${pack.title} questions`} sandbox="allow-scripts allow-forms" srcDoc={document} style={{ height: `${iframeHeight}px` }} />}
    </section>
  </div>
}

function isHeightMessage(value: unknown): value is { type: 'courseguide-assessment-height'; height: number } {
  return Boolean(value) && typeof value === 'object' &&
    (value as { type?: unknown }).type === 'courseguide-assessment-height' &&
    typeof (value as { height?: unknown }).height === 'number'
}

function buildAssessmentDocument(title: string, introduction: string, selections: AssessmentQuestionSelection[], questions: AssessmentQuestionContent[]): string {
  const renderedQuestions = questions.map((question, index) => `<article class="assessment-question" data-skill="${escapeAttribute(selections[index]?.skill ?? '')}"><header><strong>Question ${index + 1}</strong><span>${escapeHtml(selections[index]?.skill ?? '')}</span></header>${question.question_html}<details class="question-explanation" hidden><summary>Explanation</summary>${question.explanation_html}</details></article>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><base href="${window.location.origin}/"><script>window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)']]}};</script><style>${assessmentStyles}</style></head><body><main><p class="intro">${escapeHtml(introduction)}</p><section id="assessment-form">${renderedQuestions}<div class="assessment-footer"><button type="button" id="check-all">Check all questions</button><button type="button" id="reset">Reset answers</button></div><section id="recap" aria-live="polite"></section></section></main><script src="${mathJaxUrl}"></script><script>${assessmentScript}</script></body></html>`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;')
}

const assessmentStyles = `*{box-sizing:border-box}body{color:#172033;font-family:system-ui,sans-serif;margin:0}main{padding:1rem}.intro{background:#eff6ff;border-left:4px solid #2563eb;margin:0 0 1rem;padding:.75rem}.assessment-question{border:1px solid #cbd5e1;border-radius:.6rem;margin:0 0 1rem;padding:1rem}.assessment-question header{display:flex;gap:.75rem;justify-content:space-between;margin-bottom:.75rem}.assessment-question header span{color:#475569;font-size:.85rem}.assessment-question p{line-height:1.5}.assessment-question table{border-collapse:collapse;max-width:100%;width:100%}.assessment-question td,.assessment-question th{border:1px solid #cbd5e1;padding:.45rem;text-align:left}.quizgen-answer-input{border:2px solid #94a3b8;border-radius:.35rem;font:inherit;margin:.25rem;padding:.45rem}.quizgen-answer-input.is-correct{background:#dcfce7;border-color:#16a34a}.quizgen-answer-input.is-incorrect{background:#fee2e2;border-color:#dc2626}.quizgen-feedback{font-size:.85rem;font-weight:700;margin-left:.4rem}.is-correct{color:#166534}.is-incorrect{color:#991b1b}.assessment-question details{margin-top:.75rem}.assessment-footer{display:flex;flex-wrap:wrap;gap:.75rem}.assessment-footer button,.recheck-button{background:#1d4ed8;border:0;border-radius:.35rem;color:#fff;cursor:pointer;font:inherit;font-weight:700;padding:.55rem .8rem}#reset{background:#fff;border:1px solid #64748b;color:#172033}#recap{margin-top:1rem}.recap{border-radius:.5rem;padding:1rem}.recap.strong{background:#dcfce7}.recap.review{background:#fef3c7}.recap.refresh{background:#ffedd5}`

const assessmentScript = `(()=>{const norm=v=>String(v??'').trim().replace(/\\s+/g,' ');const grade=q=>{const inputs=[...q.querySelectorAll('.quizgen-answer-input')];const options=[...q.querySelectorAll('.quizgen-checkbox-option')];let ok=inputs.length+options.length>0;inputs.forEach(input=>{let accepted=[];try{accepted=JSON.parse(input.dataset.accepted||'[]')}catch{}const correct=accepted.some(answer=>norm(answer)===norm(input.value));input.classList.toggle('is-correct',correct);input.classList.toggle('is-incorrect',!correct);const feedback=input.parentElement?.querySelector('.quizgen-feedback');if(feedback){feedback.textContent=correct?'Correct':'Try again';feedback.className='quizgen-feedback '+(correct?'is-correct':'is-incorrect')}if(!correct)ok=false});options.forEach(option=>{const input=option.querySelector('input[type="checkbox"]');const correct=input instanceof HTMLInputElement&&input.checked===(option.dataset.correct==='true');option.classList.toggle('is-correct',correct);option.classList.toggle('is-incorrect',!correct);const feedback=option.querySelector('.quizgen-feedback');if(feedback){feedback.textContent=correct?'Correct':'Try again';feedback.className='quizgen-feedback '+(correct?'is-correct':'is-incorrect')}if(!correct)ok=false});return ok};const recap=(correct,total,missed)=>{const ratio=total?correct/total:0;const band=ratio>=.8?['Strong starting point','strong','You showed confidence with most representative skills. Review any missed topics, then use this as one input while planning your next course.']:ratio>=.5?['Some topics to review','review','You have a foundation to build on. Reviewing missed skills could make MATH 130 more comfortable.']:['Review would be helpful','refresh','A refresher on missed skills may help you feel more prepared. This is a self-check, not enrollment advice.'];document.querySelector('#recap').innerHTML='<div class="recap '+band[1]+'"><strong>'+correct+' of '+total+' checked — '+band[0]+'</strong><p>'+band[2]+'</p>'+(missed.length?'<p><strong>Skills to review:</strong> '+missed.join(', ')+'</p>':'')+'</div>'};const checkAll=()=>{const qs=[...document.querySelectorAll('.assessment-question')];const missed=[];let correct=0;qs.forEach(q=>{const ok=grade(q);if(ok)correct++;else missed.push(q.dataset.skill||'this topic');const explanation=q.querySelector('.question-explanation');if(explanation){explanation.hidden=false;explanation.open=true}});recap(correct,qs.length,missed);resize()};const reset=()=>{document.querySelectorAll('.quizgen-answer-input').forEach(input=>{input.value='';input.classList.remove('is-correct','is-incorrect');const feedback=input.parentElement?.querySelector('.quizgen-feedback');if(feedback)feedback.textContent='' });document.querySelectorAll('.quizgen-checkbox-option input[type="checkbox"]').forEach(input=>{input.checked=false;input.parentElement?.classList.remove('is-correct','is-incorrect')});document.querySelectorAll('.question-explanation').forEach(explanation=>{explanation.hidden=true;explanation.open=false});document.querySelector('#recap').innerHTML='';resize()};const resize=()=>parent.postMessage({type:'courseguide-assessment-height',height:document.documentElement.scrollHeight},'*');document.querySelector('#check-all').addEventListener('click',checkAll);document.querySelector('#reset').addEventListener('click',reset);new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);setTimeout(resize,500)})()`
