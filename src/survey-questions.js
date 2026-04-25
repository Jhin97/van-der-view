// Survey question definitions following Sung et al. 2020 pre/post Likert style.
// Comparable items share a `comparable_id` so the effect-size script can
// match pre Q1 ↔ post Q1, etc.

const LIKERT_SCALE = [1, 2, 3, 4, 5, 6, 7];
const LIKERT_LABELS = {
  1: 'Strongly Disagree',
  2: 'Disagree',
  3: 'Somewhat Disagree',
  4: 'Neutral',
  5: 'Somewhat Agree',
  6: 'Agree',
  7: 'Strongly Agree',
};

export const PRE_QUESTIONS = [
  {
    question_id: 'PRE_Q1',
    comparable_id: 'Q_STRUCTURE',
    text: 'I understand the basic principles of protein structure (e.g., primary, secondary, tertiary).',
    type: 'likert',
  },
  {
    question_id: 'PRE_Q2',
    comparable_id: 'Q_VISUALIZE',
    text: 'I can visualize how small molecules (ligands) interact with protein binding sites.',
    type: 'likert',
  },
  {
    question_id: 'PRE_Q3',
    comparable_id: 'Q_CONFIDENCE',
    text: 'I feel confident interpreting 3D molecular structures from 2D representations.',
    type: 'likert',
  },
  {
    question_id: 'PRE_Q4',
    comparable_id: 'Q_DOCKING',
    text: 'I am familiar with the concept of molecular docking and its role in drug design.',
    type: 'likert',
  },
];

export const POST_QUESTIONS = [
  {
    question_id: 'POST_Q1',
    comparable_id: 'Q_STRUCTURE',
    text: 'I understand the basic principles of protein structure (e.g., primary, secondary, tertiary).',
    type: 'likert',
  },
  {
    question_id: 'POST_Q2',
    comparable_id: 'Q_VISUALIZE',
    text: 'I can visualize how small molecules (ligands) interact with protein binding sites.',
    type: 'likert',
  },
  {
    question_id: 'POST_Q3',
    comparable_id: 'Q_CONFIDENCE',
    text: 'I feel confident interpreting 3D molecular structures from 2D representations.',
    type: 'likert',
  },
  {
    question_id: 'POST_Q4',
    comparable_id: 'Q_DOCKING',
    text: 'I am familiar with the concept of molecular docking and its role in drug design.',
    type: 'likert',
  },
  {
    question_id: 'POST_Q5',
    comparable_id: 'Q_PYMOL_COMPARE',
    text: 'The VR experience helped me understand molecular interactions better than using PyMOL would have.',
    type: 'likert',
  },
  {
    question_id: 'POST_Q6',
    comparable_id: null,
    text: 'What aspects of the VR experience were most helpful for your learning?',
    type: 'freetext',
  },
];

export { LIKERT_SCALE, LIKERT_LABELS };
