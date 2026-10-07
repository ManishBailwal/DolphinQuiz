// Loads demo content so you can try every round straight away.
//
//   npm run seed             fills an empty database
//   npm run seed -- --force  wipes all questions and sets first, then fills it
//
// The demo Visual, Video and Buzzer rounds use the three sample files in media/.
// Delete or replace them from the admin panel when you build your real quiz.

import { db, DB_PATH, createQuestion, createSet, isEmpty, saveSettings } from './db.js';
import { ensureMediaDirs } from './media.js';

const force = process.argv.includes('--force');

if (!isEmpty() && !force) {
  console.log(`The database already has content (${DB_PATH}).`);
  console.log('Run "npm run seed -- --force" if you want to replace it with the demo content.');
  process.exit(0);
}

ensureMediaDirs();

if (force) {
  db.exec('DELETE FROM options; DELETE FROM questions; DELETE FROM sets;');
}

// Small helpers so the content below stays easy to read and edit.
const mcq = (text, options, correct, timer = 20) => ({
  text,
  options,
  correct_index: correct,
  timer_seconds: timer,
});
const typed = (text, answer, timer = 30) => ({ text, has_options: false, answer, timer_seconds: timer });
const choice = (text, options, correct, timer = 20) => ({
  text,
  has_options: true,
  options,
  correct_index: correct,
  timer_seconds: timer,
});
const rapid = (text, answer) => ({ text, answer, timer_seconds: 30 });
const buzz = (text, answer, marks) => ({ text, has_options: false, answer, marks, timer_seconds: 0 });

const content = {
  junior: {
    mcq: [
      mcq('Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1),
      mcq('How many days are there in a leap year?', ['365', '366', '364', '367'], 1),
      // Three options only: the number of options is up to you, per question.
      mcq('Which animal is called the "Ship of the Desert"?', ['Horse', 'Camel', 'Elephant'], 1),
      mcq('What is the capital of India?', ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], 2),
      mcq('Which gas do plants take in from the air?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], 2),
    ],
    visual: {
      title: 'Count the shapes',
      media_file: 'images/sample-shapes.png',
      questions: [
        choice('How many red circles are in the picture?', ['2', '3', '4', '5'], 1),
        typed('How many triangles can you see?', '2'),
        choice('Which shape appears the most times?', ['Circle', 'Triangle', 'Square', 'Star'], 2),
        typed('What colour is the star?', 'Green'),
      ],
    },
    video: {
      title: 'The moving box',
      media_file: 'videos/sample-colours.mp4',
      questions: [
        choice('What colour was the box at the very start?', ['Blue', 'Red', 'Green', 'Yellow'], 1),
        typed('In which direction did the box move?', 'From left to right'),
        choice('Which colour came right after green?', ['Red', 'Yellow', 'Blue', 'White'], 2),
        typed('What was the last colour of the box?', 'Yellow'),
      ],
    },
    rapid: [
      rapid('Name the largest mammal on Earth.', 'Blue whale'),
      rapid('How many colours are there in a rainbow?', 'Seven'),
      rapid('What is 12 × 12?', '144'),
      rapid('Which festival is known as the festival of lights?', 'Diwali'),
      rapid('How many continents are there?', 'Seven'),
      rapid('Which is the tallest animal in the world?', 'Giraffe'),
    ],
    buzzer: {
      title: 'Teal scene',
      media_file: 'images/sample-scene.png',
      questions: [
        buzz('How many orange circles are in the picture?', '4', 50),
        buzz('What shape is in the centre?', 'A hexagon', 40),
        buzz('How many sides does that shape have?', '6', 30),
        buzz('What colour is the triangle?', 'Pink', 20),
        buzz('How many white dots are along the bottom?', '7', 10),
        buzz('What colour is the background?', 'Teal', 5),
      ],
    },
  },

  senior: {
    mcq: [
      mcq('Who wrote the Indian national anthem, "Jana Gana Mana"?', ['Bankim Chandra Chatterjee', 'Rabindranath Tagore', 'Sarojini Naidu', 'Subramania Bharati'], 1),
      mcq('What is the chemical symbol for gold?', ['Ag', 'Gd', 'Au', 'Go'], 2),
      mcq('Which is the largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3),
      mcq('In computing, what does CPU stand for?', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'], 0),
      // Five options: again, the count is per question.
      mcq('What is the smallest prime number?', ['0', '1', '2', '3', '5'], 2),
    ],
    visual: {
      title: 'Shape arithmetic',
      media_file: 'images/sample-shapes.png',
      questions: [
        typed('How many shapes are there in the picture altogether?', '11'),
        choice('How many more squares than circles are there?', ['1', '2', '3', '4'], 1),
        typed('What fraction of all the shapes are squares?', '5/11'),
        choice('Which colour is used for the fewest shapes?', ['Red', 'Blue', 'Yellow', 'Green'], 3),
      ],
    },
    video: {
      title: 'Colour sequence',
      media_file: 'videos/sample-colours.mp4',
      questions: [
        choice('How many different colours did the box show?', ['3', '4', '5', '6'], 1),
        typed('For how many seconds did each colour last?', '3 seconds'),
        choice('Which colour was shown between the 6th and 9th second?', ['Green', 'Red', 'Blue', 'Yellow'], 2),
        typed('Name the colours in the order they appeared.', 'Red, green, blue, yellow'),
      ],
    },
    rapid: [
      rapid('Who is known as the Father of the Nation in India?', 'Mahatma Gandhi'),
      rapid('What is the square root of 169?', '13'),
      rapid('What is the currency of Japan?', 'Yen'),
      rapid('Which element has the atomic number 1?', 'Hydrogen'),
      rapid('Who invented the telephone?', 'Alexander Graham Bell'),
      rapid('In which year did India gain independence?', '1947'),
    ],
    buzzer: {
      title: 'Teal scene (advanced)',
      media_file: 'images/sample-scene.png',
      questions: [
        buzz('How many circles are there in total, orange and white together?', '11', 50),
        buzz('What colour is the largest shape?', 'Purple', 40),
        buzz('How many sides do the hexagon and the triangle have altogether?', '9', 30),
        buzz('How many shapes in the picture are not circles?', '2', 20),
        buzz('How many more white dots than orange circles are there?', '3', 10),
        buzz('What colour are the circles in the four corners?', 'Orange', 5),
      ],
    },
  },
};

for (const [track, rounds] of Object.entries(content)) {
  for (const q of rounds.mcq) createQuestion({ track, category: 'mcq', ...q });
  for (const q of rounds.rapid) createQuestion({ track, category: 'rapid', ...q });
  for (const category of ['visual', 'video', 'buzzer']) {
    createSet({ track, category, ...rounds[category] });
  }
}

saveSettings({ event_title: 'School Quiz Program' });

const counts = db
  .prepare('SELECT track, category, COUNT(*) AS n FROM questions GROUP BY track, category ORDER BY track, category')
  .all();
console.log(`Demo content loaded into ${DB_PATH}`);
for (const row of counts) console.log(`  ${row.track.padEnd(7)} ${row.category.padEnd(7)} ${row.n} questions`);
