/* Kind definition of 'training' spaces: sidebar modules, print documents, coach summary. */
import { lazy } from 'react';
import { Camera, Dumbbell, MessageSquareHeart, Ruler, Salad, Sun, Target } from 'lucide-react';
import type { SpaceKindDef } from '../kinds';
import { normalizeTraining } from './types';
import { trainingCoachSummary } from './calc';
import { trainingPrintDocs } from './print';

export const trainingKind: SpaceKindDef = {
  groups: ['Today', 'Plan', 'Progress'],
  modules: [
    { id: 'overview', label: 'Today', group: 'Today', icon: Sun, description: "Today's plan, quick check-in, streaks and weight trend", component: lazy(() => import('./modules/overview')) },
    { id: 'coach', label: 'Journal & Coach', group: 'Today', icon: MessageSquareHeart, description: 'Check-in blurbs, insights, coach notes and AI coaching prompts', component: lazy(() => import('./modules/coach')) },
    { id: 'goals', label: 'Goals', group: 'Plan', icon: Target, description: 'Overall goal, habit and strength targets, projections', component: lazy(() => import('./modules/goals')) },
    { id: 'nutrition', label: 'Nutrition', group: 'Plan', icon: Salad, description: 'Macro calculator, meals, weekly meal plan, grocery list, food log', component: lazy(() => import('./modules/nutrition')) },
    { id: 'workouts', label: 'Workouts', group: 'Plan', icon: Dumbbell, description: 'Program, session logging, history, progress and PRs', component: lazy(() => import('./modules/workouts')) },
    { id: 'body', label: 'Body', group: 'Progress', icon: Ruler, description: 'Weight, body fat and measurements with charts', component: lazy(() => import('./modules/body')) },
    { id: 'photos', label: 'Progress Photos', group: 'Progress', icon: Camera, description: 'Daily photos by pose, compare and timelapse video', component: lazy(() => import('./modules/photos')) },
  ],
  printDocs: trainingPrintDocs,
  coachSummary: (s, today) => trainingCoachSummary(normalizeTraining(s.training), today),
  navParams: {
    overview: 'checkin (true opens the quick check-in)',
    coach: 'checkInId',
    goals: 'goalId',
    nutrition: "tab ('plan' | 'meals' | 'groceries' | 'calculator' | 'log'), week (YYYY-MM-DD in the week), mealId, date (food log day)",
    workouts: "tab ('log' | 'program' | 'history' | 'progress' | 'exercises'), sessionId, exercise (id or name), dayId",
    body: "tab ('log' | 'charts')",
    photos: "tab ('gallery' | 'timelapse' | 'compare'), pose ('front' | 'side' | 'back' | 'other'), photoId",
  },
};

