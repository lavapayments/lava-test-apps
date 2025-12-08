// Configuration
const MODEL = 'gpt-4o-mini'; // Change this to switch models (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022', etc.)

// Local backend endpoint (server.cjs handles the Lava API call)
const API_URL = 'http://localhost:3001/api/grade';

// State
const currentProblem = {
  num1: 0,
  num2: 0,
  answer: 0,
};

// DOM Elements
const problemEl = document.getElementById('problem');
const answerInput = document.getElementById('answer-input');
const submitBtn = document.getElementById('submit-btn');
const feedbackSection = document.getElementById('feedback-section');
const feedbackEl = document.getElementById('feedback');
const nextBtn = document.getElementById('next-btn');

// Generate a new problem
function generateProblem() {
  currentProblem.num1 = Math.floor(Math.random() * 101); // 0-100
  currentProblem.num2 = Math.floor(Math.random() * 101); // 0-100
  currentProblem.answer = currentProblem.num1 + currentProblem.num2;

  problemEl.textContent = `${currentProblem.num1} + ${currentProblem.num2} = ?`;
  answerInput.value = '';
  answerInput.focus();
  feedbackSection.classList.add('hidden');
}

// Grade the answer using LLM
async function gradeAnswer(userAnswer) {
  const isCorrect = Number.parseInt(userAnswer) === currentProblem.answer;

  if (isCorrect) {
    return {
      correct: true,
      feedback: '',
    };
  }

  // If wrong, get explanation from LLM
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful math tutor. Explain why the answer is wrong and show the correct solution in a simple, encouraging way for elementary students. Keep it brief (2-3 sentences).',
          },
          {
            role: 'user',
            content: `The problem is ${currentProblem.num1} + ${currentProblem.num2}. The student answered ${userAnswer}, but the correct answer is ${currentProblem.answer}. Explain why and how to solve it.`,
          },
        ],
        max_tokens: 150,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return {
      correct: false,
      feedback: data.choices[0].message.content,
    };
  } catch (error) {
    console.error('Error calling LLM:', error);
    return {
      correct: false,
      feedback: `That's not quite right. The correct answer is ${currentProblem.answer}. ${currentProblem.num1} + ${currentProblem.num2} = ${currentProblem.answer}`,
    };
  }
}

// Handle submit
async function handleSubmit() {
  const userAnswer = answerInput.value.trim();

  if (!userAnswer) {
    alert('Please enter an answer');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking...';

  const result = await gradeAnswer(userAnswer);

  feedbackSection.classList.remove('hidden');

  if (result.correct) {
    feedbackEl.innerHTML = '<p class="correct">✓ Correct! Great job!</p>';
  } else {
    feedbackEl.innerHTML = `<p class="incorrect">✗ Not quite right.</p><p class="explanation">${result.feedback}</p>`;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';
}

// Event Listeners
submitBtn.addEventListener('click', handleSubmit);

answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleSubmit();
  }
});

nextBtn.addEventListener('click', generateProblem);

// Initialize
generateProblem();
