// Shared constants. Everything the rest of the server needs to agree on lives here.

export const TRACKS = ['junior', 'senior'];

// mcq and rapid are lists of single questions.
// visual, video and buzzer are "sets": one image or video plus several questions.
export const CATEGORIES = ['mcq', 'visual', 'video', 'rapid', 'buzzer'];
export const SET_CATEGORIES = ['visual', 'video', 'buzzer'];

// Which kind of media file each set category uses.
export const SET_MEDIA_KIND = { visual: 'image', video: 'video', buzzer: 'image' };

// The parameters the admin can change on the Settings tab.
// type: text | int | bool | intlist
export const SETTINGS_SPEC = {
  event_title: { type: 'text', default: 'Quiz Program', max: 80, label: 'Event title' },
  mcq_timer: { type: 'int', default: 30, min: 0, max: 600, label: 'MCQ timer' },
  rapid_timer: { type: 'int', default: 30, min: 0, max: 600, label: 'Rapid Fire timer' },
  default_option_count: { type: 'int', default: 4, min: 2, max: 8, label: 'Options per new question' },
  rapid_per_student: { type: 'int', default: 2, min: 1, max: 10, label: 'Rapid Fire questions per student' },
  visual_question_count: { type: 'int', default: 4, min: 1, max: 12, label: 'Questions per image (Visual Round)' },
  video_question_count: { type: 'int', default: 4, min: 1, max: 12, label: 'Questions per video' },
  buzzer_question_count: { type: 'int', default: 6, min: 1, max: 12, label: 'Questions per image (Buzzer Round)' },
  buzzer_marks: { type: 'intlist', default: [50, 40, 30, 20, 10, 5], label: 'Buzzer marks' },
};

export const MAX_OPTIONS = 8;
export const MIN_OPTIONS = 2;
