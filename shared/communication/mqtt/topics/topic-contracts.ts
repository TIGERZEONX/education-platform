import type { FeedbackType } from "../contracts";

export interface TopicScope {
  classId: string;
  studentId?: string;
}

export interface TopicContractSet {
  classNamespace: string;
  classWildcard: string;
  studentWildcard: string;
  engagementPerStudent: string;
  studentStatusPerStudent: string;
  feedbackByType: Record<FeedbackType, string>;
  sessionInfo: string;
  classPulse: string;
  cognitiveMap: string;
  teacherNudges: string;
}

export const TOPIC_PREFIX = "cognitivepulse";

export function topicForClassNamespace(scope: TopicScope): string {
  return `${TOPIC_PREFIX}/class/${scope.classId}`;
}

export function topicForClassWildcard(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/#`;
}

export function topicForStudentWildcard(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/student/${scope.studentId ?? "{studentId}"}/#`;
}

export function topicForStudentEngagement(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/student/${scope.studentId ?? "{studentId}"}/engagement`;
}

export function topicForFeedback(scope: TopicScope, feedbackType: FeedbackType): string {
  return `${topicForClassNamespace(scope)}/feedback/${feedbackType}`;
}

export function topicForStudentStatus(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/student/${scope.studentId ?? "{studentId}"}/status`;
}

export function topicForSessionInfo(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/session/info`;
}

export function topicForClassPulse(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/pulse`;
}

export function topicForTeacherNudges(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/teacher/nudges`;
}

export function topicForCognitiveMap(scope: TopicScope): string {
  return `${topicForClassNamespace(scope)}/cognitive-map`;
}

export function buildTopicContracts(scope: TopicScope): TopicContractSet {
  return {
    classNamespace: topicForClassNamespace(scope),
    classWildcard: topicForClassWildcard(scope),
    studentWildcard: topicForStudentWildcard(scope),
    engagementPerStudent: topicForStudentEngagement(scope),
    studentStatusPerStudent: topicForStudentStatus(scope),
    feedbackByType: {
      confused: topicForFeedback(scope, "confused"),
      repeat: topicForFeedback(scope, "repeat"),
      understood: topicForFeedback(scope, "understood"),
    },
    sessionInfo: topicForSessionInfo(scope),
    classPulse: topicForClassPulse(scope),
    cognitiveMap: topicForCognitiveMap(scope),
    teacherNudges: topicForTeacherNudges(scope),
  };
}
