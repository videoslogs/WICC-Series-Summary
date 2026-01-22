
export interface MatchData {
  date: string;
  matchNumber: string;
  innings: 'i' | 'ii';
  teamOneName: string;
  teamTwoName: string;
  teamOneScore: string; 
  teamTwoScore: string; 
  teamOneInn1?: string;
  teamOneInn2?: string;
  teamTwoInn1?: string;
  teamTwoInn2?: string;
  overs: string;
  resultType: 'Win' | 'Loose' | 'Draw' | 'Aboundunt' | 'Follow-on';
  teamOnePoints: string;
  teamTwoPoints: string;
  moi1: string;
  moi2: string;
  mom: string;
  mos: string;
  winMargin?: string;
}

export enum ThemeColors {
  TEAM_ONE = 'blue',
  TEAM_TWO = 'orange',
  WINNER = 'gold',
  SERIES = 'orange'
}
