export type EngagementLevel = "contact" | "attendee" | "activist" | "delegate" | "leader";

export const ENGAGEMENT_LEVELS: { level: EngagementLevel; label: string; minScore: number; color: string }[] = [
  { level: "contact", label: "Contact", minScore: 0, color: "#9CA3AF" },
  { level: "attendee", label: "Attendee", minScore: 20, color: "#3B82F6" },
  { level: "activist", label: "Activist", minScore: 50, color: "#F59E0B" },
  { level: "delegate", label: "Delegate", minScore: 75, color: "#10B981" },
  { level: "leader", label: "Leader", minScore: 90, color: "#7C3AED" },
];

export function getEngagementLevel(score: number): EngagementLevel {
  for (let i = ENGAGEMENT_LEVELS.length - 1; i >= 0; i--) {
    if (score >= ENGAGEMENT_LEVELS[i].minScore) {
      return ENGAGEMENT_LEVELS[i].level;
    }
  }
  return "contact";
}

export function getLevelInfo(level: EngagementLevel) {
  return ENGAGEMENT_LEVELS.find((l) => l.level === level) || ENGAGEMENT_LEVELS[0];
}

interface EngagementFactors {
  isMember: boolean;
  isDelegate: boolean;
  isBargainingRep: boolean;
  campaignActionsParticipated: number;
  meetingsAttended: number;
  communicationsReceived: number;
  communicationsResponded: number;
  daysSinceLastContact: number;
  hasSignedPetition: boolean;
  hasAttendedRally: boolean;
}

export function calculateEngagementScore(factors: EngagementFactors): number {
  let score = 0;

  if (factors.isMember) score += 15;
  if (factors.isDelegate) score += 25;
  if (factors.isBargainingRep) score += 20;

  score += Math.min(factors.campaignActionsParticipated * 5, 20);
  score += Math.min(factors.meetingsAttended * 3, 15);

  if (factors.communicationsReceived > 0) {
    const responseRate = factors.communicationsResponded / factors.communicationsReceived;
    score += Math.round(responseRate * 10);
  }

  if (factors.hasSignedPetition) score += 5;
  if (factors.hasAttendedRally) score += 10;

  if (factors.daysSinceLastContact < 30) {
    score += 5;
  } else if (factors.daysSinceLastContact > 180) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
