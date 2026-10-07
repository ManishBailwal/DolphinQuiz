# Quiz Console

A live quiz for a school event, run by one operator on a laptop that is mirrored to a big screen.
Two groups (Junior and Senior), five rounds each, plus an admin panel to manage everything.

No `npm install` needed: it only uses what ships with Node (version 22.13 or newer), including
Node's built-in SQLite.

## Run it

```
npm run seed     # optional: loads demo questions so you can try every round
npm start
```

- Quiz screen (put this on the big screen): http://localhost:3000/
- Admin panel: http://localhost:3000/admin

To change the port: `PORT=8080 npm start`. The server only listens on this laptop by default;
set `HOST=0.0.0.0` if you ever want to open the admin panel from another device.
Node may print an "ExperimentalWarning: SQLite" line on start. It is harmless.

`npm run seed -- --force` wipes all questions and reloads the demo content.

## The rounds

| Round | What it does |
| --- | --- |
| MCQs | One question at a time, timer, 2 to 8 options (you choose per question). |
| Visual Round | One image, several questions (4 by default). The image stays on screen until the last question. Each question either has options or a typed answer. |
| Video Round | Same as Visual, with a video. Play/pause with the button or the P key; the video keeps playing between questions. |
| Rapid Fire | Every student gets 2 questions (changeable in Settings), each with a timer, no options. Questions are dealt out student by student. |
| Buzzer Round | One image, 6 questions (changeable). The question number and its marks are shown big on screen. Marks are set per question when you write it. |

## Running the quiz

1. Pick Junior or Senior, then a round. Start stays greyed out until both are chosen.
2. A question's timer starts the moment it appears on screen. Space always presses the highlighted
   button (Pause, Submit, Next) and number keys 1 to 8 pick an option. F toggles fullscreen, P plays or
   pauses a video.
3. If a timer runs out, the correct answer is shown automatically.
4. Use Home to go back and pick the next round.

## Admin panel

Choose Junior or Senior, then a round tab. Add, edit, reorder (Up/Down) or delete questions.
For image, video and Buzzer rounds you upload the file (or pick one already in the folder) and write its
questions in one go, with "Add question" and "Remove" to use anywhere from 1 to 12 questions per image
or video. The Settings tab holds the event title, timers, the starting number of questions for new images
and videos, questions per student in Rapid Fire, and the default marks list for the Buzzer Round.

## Where things are stored

- Database: `data/quiz.db` (created on first run). Copy this file to back up all your questions.
- Images and videos: `media/images/` and `media/videos/`. The database only stores the file name,
  so you can also drop files into these folders yourself and pick them in the admin panel.
  Use formats every browser plays: .mp4 (H.264), .webm for video; .jpg, .png, .webp, .gif for images.
- Other locations: `DB_FILE=/path/quiz.db` and `MEDIA_DIR=/path/media`.

The two demo images and the demo video in `media/` are only there for the seed data. Delete them from the
folder once you have your own.

## Code layout

```
server/   config.js  validate.js  db.js  media.js  http.js  server.js  seed.js
public/   index.html (quiz screen)  admin.html   css/   js/quiz/   js/admin/
```
