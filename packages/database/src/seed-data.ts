/** Default classification data for Ugandan schools. Safe to re-run (upserts by slug). */

export const LEVELS = [
  { name: 'Nursery', slug: 'nursery', sortOrder: 1 },
  { name: 'Primary', slug: 'primary', sortOrder: 2 },
  { name: 'Secondary', slug: 'secondary', sortOrder: 3 },
];

const numberWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];

export const CLASSES: {
  name: string;
  shortName: string;
  slug: string;
  level: string;
  aliases: string[];
}[] = [
  { name: 'Baby Class', shortName: 'Baby', slug: 'baby-class', level: 'nursery', aliases: ['baby'] },
  { name: 'Middle Class', shortName: 'Middle', slug: 'middle-class', level: 'nursery', aliases: ['middle'] },
  { name: 'Top Class', shortName: 'Top', slug: 'top-class', level: 'nursery', aliases: ['top'] },
  ...Array.from({ length: 7 }, (_, i) => ({
    name: `Primary ${i + 1}`,
    shortName: `P${i + 1}`,
    slug: `p${i + 1}`,
    level: 'primary',
    aliases: [`primary ${i + 1}`, `primary ${numberWords[i]}`, `p.${i + 1}`, `p ${i + 1}`],
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `Senior ${i + 1}`,
    shortName: `S${i + 1}`,
    slug: `s${i + 1}`,
    level: 'secondary',
    aliases: [`senior ${i + 1}`, `senior ${numberWords[i]}`, `s.${i + 1}`, `s ${i + 1}`, `form ${i + 1}`],
  })),
];

export const SUBJECTS: { name: string; slug: string; shortName?: string; aliases: string[] }[] = [
  { name: 'Mathematics', slug: 'mathematics', shortName: 'Maths', aliases: ['maths', 'math', 'mtc', 'mth', 'numeracy'] },
  { name: 'English', slug: 'english', shortName: 'Eng', aliases: ['eng', 'english language'] },
  { name: 'Science', slug: 'science', shortName: 'Sci', aliases: ['sci', 'primary science'] },
  { name: 'Social Studies', slug: 'social-studies', shortName: 'SST', aliases: ['sst', 'social studies', 'social'] },
  { name: 'Religious Education', slug: 'religious-education', shortName: 'RE', aliases: ['re', 'cre', 'ire', 'religious', 'christian religious education', 'islamic religious education'] },
  { name: 'Literacy', slug: 'literacy', aliases: ['literacy 1', 'literacy 2', 'reading'] },
  { name: 'Integrated Science', slug: 'integrated-science', aliases: ['integrated sci', 'int science'] },
  { name: 'Biology', slug: 'biology', shortName: 'Bio', aliases: ['bio'] },
  { name: 'Chemistry', slug: 'chemistry', shortName: 'Chem', aliases: ['chem'] },
  { name: 'Physics', slug: 'physics', shortName: 'Phy', aliases: ['phy', 'phys'] },
  { name: 'Geography', slug: 'geography', shortName: 'Geog', aliases: ['geog', 'geo'] },
  { name: 'History', slug: 'history', shortName: 'Hist', aliases: ['hist', 'history and political education'] },
  { name: 'Agriculture', slug: 'agriculture', shortName: 'Agric', aliases: ['agric', 'agri'] },
  { name: 'ICT', slug: 'ict', aliases: ['information and communication technology', 'ict'] },
  { name: 'Computer Studies', slug: 'computer-studies', aliases: ['computer', 'computers', 'computer studies'] },
  { name: 'Entrepreneurship', slug: 'entrepreneurship', shortName: 'Entre', aliases: ['entre', 'ent', 'enterprenuership'] },
  { name: 'Economics', slug: 'economics', shortName: 'Econ', aliases: ['econ', 'economic'] },
  { name: 'Literature', slug: 'literature', shortName: 'Lit', aliases: ['lit', 'literature in english'] },
  { name: 'Fine Art', slug: 'fine-art', aliases: ['art', 'fine arts', 'art and design'] },
  { name: 'Physical Education', slug: 'physical-education', shortName: 'PE', aliases: ['pe', 'p.e'] },
  { name: 'Kiswahili', slug: 'kiswahili', aliases: ['swahili'] },
  { name: 'Luganda', slug: 'luganda', aliases: [] },
  { name: 'French', slug: 'french', aliases: [] },
];

const primaryLower = ['english', 'mathematics', 'literacy', 'religious-education', 'luganda', 'kiswahili'];
const primaryUpper = [
  'english',
  'mathematics',
  'science',
  'social-studies',
  'religious-education',
  'kiswahili',
  'luganda',
  'physical-education',
  'fine-art',
];
const oLevel = [
  'english',
  'mathematics',
  'biology',
  'chemistry',
  'physics',
  'integrated-science',
  'geography',
  'history',
  'agriculture',
  'ict',
  'computer-studies',
  'entrepreneurship',
  'literature',
  'fine-art',
  'physical-education',
  'religious-education',
  'kiswahili',
  'luganda',
  'french',
];
const aLevel = [
  'mathematics',
  'biology',
  'chemistry',
  'physics',
  'geography',
  'history',
  'economics',
  'entrepreneurship',
  'literature',
  'fine-art',
  'agriculture',
  'ict',
  'religious-education',
  'kiswahili',
  'luganda',
  'french',
];

export const CLASS_SUBJECTS: Record<string, string[]> = {
  'baby-class': ['english', 'mathematics', 'literacy'],
  'middle-class': ['english', 'mathematics', 'literacy'],
  'top-class': ['english', 'mathematics', 'literacy'],
  p1: primaryLower,
  p2: primaryLower,
  p3: primaryLower,
  p4: primaryUpper,
  p5: primaryUpper,
  p6: primaryUpper,
  p7: primaryUpper,
  s1: oLevel,
  s2: oLevel,
  s3: oLevel,
  s4: oLevel,
  s5: aLevel,
  s6: aLevel,
};

export const RESOURCE_TYPES: {
  name: string;
  pluralName: string;
  slug: string;
  aliases: string[];
  showInNav?: boolean;
  description: string;
}[] = [
  { name: 'Past Paper', pluralName: 'Past Papers', slug: 'past-papers', aliases: ['past paper', 'past papers', 'paper', 'papers', 'exam', 'exams', 'examination', 'examinations', 'pp', 'end of term', 'mid term', 'beginning of term'], showInNav: true, description: 'Past examination papers including beginning, mid and end of term examinations.' },
  { name: 'Notes', pluralName: 'Notes', slug: 'notes', aliases: ['note', 'notes', 'lesson notes'], showInNav: true, description: 'Lesson notes and summaries arranged by topic.' },
  { name: 'Scheme of Work', pluralName: 'Schemes of Work', slug: 'schemes-of-work', aliases: ['scheme', 'schemes', 'scheme of work', 'schemes of work', 'sow'], showInNav: true, description: 'Termly schemes of work for teachers.' },
  { name: 'Lesson Plan', pluralName: 'Lesson Plans', slug: 'lesson-plans', aliases: ['lesson plan', 'lesson plans', 'plan', 'plans'], showInNav: true, description: 'Ready-to-use lesson plans.' },
  { name: 'Marking Guide', pluralName: 'Marking Guides', slug: 'marking-guides', aliases: ['marking guide', 'marking guides', 'marking scheme', 'answers', 'answer key', 'guide'], description: 'Marking guides and answer keys for examinations.' },
  { name: 'Revision Material', pluralName: 'Revision Materials', slug: 'revision-materials', aliases: ['revision', 'revision material', 'revision materials'], description: 'Revision materials to prepare for examinations.' },
  { name: 'Mock Paper', pluralName: 'Mock Papers', slug: 'mock-papers', aliases: ['mock', 'mocks', 'mock paper', 'mock papers', 'mock exam', 'mock examination', 'pre-mock'], description: 'Mock examinations for candidate classes.' },
  { name: 'Worksheet', pluralName: 'Worksheets', slug: 'worksheets', aliases: ['worksheet', 'worksheets', 'exercise', 'exercises'], description: 'Practice worksheets and exercises.' },
  { name: 'Holiday Package', pluralName: 'Holiday Packages', slug: 'holiday-packages', aliases: ['holiday package', 'holiday packages', 'holiday work', 'holiday'], description: 'Holiday work packages for learners.' },
  { name: 'Curriculum', pluralName: 'Curriculum Documents', slug: 'curriculum', aliases: ['curriculum', 'curriculum document'], description: 'Official curriculum documents.' },
  { name: 'Syllabus', pluralName: 'Syllabi', slug: 'syllabi', aliases: ['syllabus', 'syllabi', 'syllabuses'], description: 'Subject syllabi.' },
  { name: 'Teacher Guide', pluralName: 'Teacher Guides', slug: 'teacher-guides', aliases: ['teacher guide', 'teachers guide', 'teacher guides'], description: 'Guides for teachers.' },
  { name: 'Learner Book', pluralName: 'Learner Books', slug: 'learner-books', aliases: ['learner book', 'learners book', 'textbook', 'text book', 'pupil book'], description: 'Learner books and textbooks.' },
  { name: 'Topical Questions', pluralName: 'Topical Questions', slug: 'topical-questions', aliases: ['topical questions', 'topical', 'questions'], description: 'Questions arranged by topic.' },
  { name: 'Project', pluralName: 'Projects', slug: 'projects', aliases: ['project', 'projects'], description: 'Projects and project guidelines.' },
  { name: 'Assessment', pluralName: 'Assessments', slug: 'assessments', aliases: ['assessment', 'assessments', 'assessment tool'], description: 'Assessment tools and activities of integration.' },
  { name: 'Revision Test', pluralName: 'Revision Tests', slug: 'revision-tests', aliases: ['revision test', 'revision tests', 'test', 'tests'], description: 'Short revision tests.' },
  { name: 'Study Guide', pluralName: 'Study Guides', slug: 'study-guides', aliases: ['study guide', 'study guides'], description: 'Study guides for learners.' },
  { name: 'Question Bank', pluralName: 'Question Banks', slug: 'question-banks', aliases: ['question bank', 'question banks'], description: 'Banks of practice questions.' },
  { name: 'Activity', pluralName: 'Activities', slug: 'activities', aliases: ['activity', 'activities'], description: 'Classroom and learner activities.' },
];

export const TERMS = [
  { name: 'Term 1', slug: 'term-1', number: 1 },
  { name: 'Term 2', slug: 'term-2', number: 2 },
  { name: 'Term 3', slug: 'term-3', number: 3 },
];

export const YEARS = Array.from({ length: 10 }, (_, i) => 2018 + i);

export const CURRICULA = [
  { name: 'Competence-Based Curriculum (New Lower Secondary)', slug: 'new-curriculum', description: 'The NCDC competence-based lower secondary curriculum.' },
  { name: 'Thematic Curriculum', slug: 'thematic-curriculum', description: 'Thematic curriculum for P1–P3.' },
  { name: 'Old Curriculum', slug: 'old-curriculum', description: 'Resources for the previous curriculum.' },
];

export const DEFAULT_SITE_SETTINGS = {
  siteName: 'EduShare Uganda',
  tagline: 'Free notes, past papers, schemes of work and lesson plans',
  description:
    'Search and download free educational resources for Ugandan schools — past papers, notes, schemes of work, lesson plans and more for Nursery, Primary and Secondary.',
  contactEmail: null,
  whatsappNumber: null,
  footerNote: 'All resources are free to download. No account needed.',
};

export const DEFAULT_HOMEPAGE_SETTINGS = {
  heroTitle: 'Free learning resources for every Ugandan classroom',
  heroSubtitle:
    'Past papers, notes, schemes of work and lesson plans from Baby Class to S6. Search, preview and download — no account needed.',
  searchPlaceholder: 'Search notes, past papers, schemes, lesson plans...',
  announcement: null,
  featuredSubjectIds: [] as string[],
  featuredCollectionIds: [] as string[],
  sections: [
    { key: 'featured', enabled: true },
    { key: 'recent', enabled: true, title: 'Recently added' },
    { key: 'popular', enabled: true, title: 'Popular downloads' },
    { key: 'past-papers', enabled: true },
    { key: 'schemes-of-work', enabled: true },
    { key: 'lesson-plans', enabled: true },
    { key: 'notes', enabled: true },
    { key: 'collections', enabled: true },
  ],
};
