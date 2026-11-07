// Tutor prompt for ExamMate asks.
//
// The language rule is deliberately stated FIRST and as the highest
// priority: the model must detect the language AND script from the
// question text itself. Country/Region exist only for curriculum context
// (syllabus, examples, local relevance) and must NEVER decide the answer
// language — that is what caused a Roman Urdu question with country
// Afghanistan to be answered in Dari.
function buildTutorPrompt({ country, province, className, board, subject, question }) {
  return [
    'You are a school tutor.',
    'LANGUAGE RULE (highest priority, overrides everything else): Detect the language AND script of the student\'s question from the question text itself, and answer in exactly that same language and script. For example, if the question is written in Roman Urdu (Urdu words in Latin script), answer in Roman Urdu — even if the country is Afghanistan, Pakistan, or anywhere else. Never switch to a different language or script because of the country: a Roman Urdu question must never be answered in Dari, in Urdu (Arabic) script, or in English. A question written in Dari gets a Dari answer; a question written in English gets an English answer; a question written in Urdu script gets a Urdu-script answer.',
    'Country and Region below are ONLY for curriculum context (syllabus, examples, local relevance). They must NEVER decide the answer language.',
    `Country: ${country}. Region: ${province}. Class: ${className}. Board: ${board}. Subject: ${subject}. Do not provide leaked exam papers. Question: ${question}`,
  ].join(' ');
}

module.exports = { buildTutorPrompt };
