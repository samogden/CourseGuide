# Assessment question export contract

The planner assembles one static YAML question file for each assessment skill. The MATH 130 pack is located at:

```
public/assessments/MATH-130/q01/v001.yaml
```

The assessment manifest declares the ten skill IDs and available variation count. The app randomly chooses one YAML file for each slot, so 200 variations across ten slots produce \(200^{10}\) possible combinations.

Each file contains `question_html`, `answer`, and `explanation_html`. The HTML fields may include MathJax markup, images, tables, and formatted text, but must not include full-page wrappers, stylesheets, or scripts. The planner supplies shared styling, answer checking, MathJax, and the final readiness recap.

Text answers use the existing generator convention:

```html
question_html: '<input class="quizgen-answer-input" data-accepted="[&quot;accepted answer&quot;]">'
answer:
  - label: Answer
    accepted_values: [accepted answer]
    kind: fill_in_multiple_blanks_question
explanation_html: '<p>Walkthrough…</p>'
```

Images may be data URLs or absolute paths under `public/assessments/`. Question HTML is teacher-authored content and is rendered inside a sandboxed iframe.
