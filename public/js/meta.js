// Names and descriptions used on screen. The ids match the server (server/config.js).

export const TRACKS = {
  junior: { label: 'Junior' },
  senior: { label: 'Senior' },
};

export const CATEGORIES = {
  mcq: { label: 'MCQs', blurb: 'Timed questions with options', isSet: false },
  visual: { label: 'Visual Round', blurb: 'One image, several questions', isSet: true, media: 'image', unit: 'image' },
  video: { label: 'Video Round', blurb: 'One clip, several questions', isSet: true, media: 'video', unit: 'video' },
  rapid: { label: 'Rapid Fire', blurb: 'Short answers, a turn per student', isSet: false },
  buzzer: { label: 'Buzzer Round', blurb: 'One image, marks per question', isSet: true, media: 'image', unit: 'image' },
};
