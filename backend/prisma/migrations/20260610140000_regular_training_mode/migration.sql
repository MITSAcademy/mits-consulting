-- Add meeting mode to RegularTraining (Zoom, GoToMeeting, Teams, Google Meet, Phone, Other)
ALTER TABLE "RegularTraining" ADD COLUMN "meetingMode" TEXT;

-- Add per-session meeting link to TrainingSession
ALTER TABLE "TrainingSession" ADD COLUMN "meetingLink" TEXT;
