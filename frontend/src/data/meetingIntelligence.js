export const meetingPlatform = 'MeetNote Recorder'

export const transcript = [
  {
    id: 'seg-1',
    time: '00:02',
    speaker: 'Sakshi',
    text: "Good morning everyone. Let's get started.",
  },
  {
    id: 'seg-2',
    time: '00:07',
    speaker: 'Rahul',
    text: "Today we'll discuss the project architecture.",
  },
  {
    id: 'seg-3',
    time: '00:15',
    speaker: 'Ananya',
    text: 'I completed the dashboard UI.',
  },
  {
    id: 'seg-4',
    time: '00:24',
    speaker: 'Sakshi',
    text: "Great. Let's discuss the API integration.",
  },
  {
    id: 'seg-5',
    time: '00:38',
    speaker: 'Rahul',
    text: 'The backend endpoints are ready for testing.',
  },
  {
    id: 'seg-6',
    time: '00:46',
    speaker: 'Ananya',
    text: "I'll test the integration tomorrow.",
  },
  {
    id: 'seg-7',
    time: '00:55',
    speaker: 'Sakshi',
    text: 'We should keep authentication on the backend for now.',
  },
  {
    id: 'seg-8',
    time: '01:08',
    speaker: 'Rahul',
    text: "I'll open the auth endpoints for review before Tuesday.",
  },
  {
    id: 'seg-9',
    time: '01:21',
    speaker: 'Ananya',
    text: 'Deployment can wait until the integration test passes.',
  },
  {
    id: 'seg-10',
    time: '01:34',
    speaker: 'Sakshi',
    text: "Let's capture the dashboard stack and the recorder plan as decisions.",
  },
]

export const meetingSummary = {
  headline: 'AI Meeting Summary',
  body: 'The team reviewed frontend dashboard progress and confirmed the backend endpoints are ready for integration testing. Sakshi, Rahul, and Ananya agreed to keep authentication on the backend, connect recording through the Chrome extension, and hold deployment until that integration test passes.',
  points: [
    'Frontend dashboard progress',
    'Backend API integration',
    'Authentication planning',
    'Testing',
    'Deployment',
  ],
}

export const actionItems = [
  {
    id: 'action-dashboard',
    task: 'Complete dashboard UI',
    assignee: 'Sakshi',
    due: 'Monday',
    status: 'Pending',
  },
  {
    id: 'action-auth',
    task: 'Fix API authentication',
    assignee: 'Rahul',
    due: 'Tuesday',
    status: 'Pending',
  },
  {
    id: 'action-docs',
    task: 'Prepare documentation',
    assignee: 'Ananya',
    due: null,
    status: 'Completed',
  },
]

export const decisions = [
  {
    id: 'decision-stack',
    text: '"Use React and Tailwind for the web dashboard."',
    time: '00:24',
    context: 'Agreed while reviewing the dashboard UI and the API integration.',
  },
  {
    id: 'decision-recorder',
    text: '"Connect the recorder through the Chrome extension."',
    time: '00:46',
    context: 'Chosen as the path for sending recordings into MeetNote.',
  },
]
