import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Exercise {
  name: string;
  muscleGroup: string;
  sets: number;
  reps: string;
  equipment: string[];
}

interface Workout {
  id: string;
  name: string;
  type: string;
  exercises: Exercise[];
  totalDuration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  createdAt: Date;
}

interface WorkoutState {
  savedWorkouts: Workout[];
  nextId: number;
}

const state: WorkoutState = {
  savedWorkouts: [],
  nextId: 1
};

function generateId(): string {
  return 'WKT-' + String(state.nextId++).padStart(3, '0');
}

const exerciseDatabase: Record<string, Exercise[]> = {
  chest: [
    { name: 'Push-ups', muscleGroup: 'chest', sets: 3, reps: '12-15', equipment: ['none'] },
    { name: 'Dumbbell Bench Press', muscleGroup: 'chest', sets: 4, reps: '10-12', equipment: ['dumbbells', 'bench'] }
  ],
  back: [
    { name: 'Pull-ups', muscleGroup: 'back', sets: 3, reps: '8-10', equipment: ['pull-up bar'] },
    { name: 'Dumbbell Rows', muscleGroup: 'back', sets: 3, reps: '10-12', equipment: ['dumbbells'] }
  ],
  legs: [
    { name: 'Squats', muscleGroup: 'legs', sets: 4, reps: '12-15', equipment: ['none'] },
    { name: 'Lunges', muscleGroup: 'legs', sets: 3, reps: '10 each', equipment: ['none'] }
  ],
  core: [
    { name: 'Plank', muscleGroup: 'core', sets: 3, reps: '45 sec', equipment: ['none'] },
    { name: 'Bicycle Crunches', muscleGroup: 'core', sets: 3, reps: '20', equipment: ['none'] }
  ],
  cardio: [
    { name: 'Jumping Jacks', muscleGroup: 'cardio', sets: 3, reps: '30 sec', equipment: ['none'] },
    { name: 'Burpees', muscleGroup: 'cardio', sets: 3, reps: '10', equipment: ['none'] }
  ],
  arms: [
    { name: 'Bicep Curls', muscleGroup: 'arms', sets: 3, reps: '12', equipment: ['dumbbells'] },
    { name: 'Tricep Dips', muscleGroup: 'arms', sets: 3, reps: '12', equipment: ['chair'] }
  ]
};

function generateWorkout(focus: string, duration: number, difficulty: string): Workout {
  const exercises: Exercise[] = [];
  const focusAreas = focus === 'full' ? Object.keys(exerciseDatabase) : [focus];
  focusAreas.forEach(area => {
    if (exerciseDatabase[area]) {
      const areaExercises = exerciseDatabase[area];
      const count = focus === 'full' ? 1 : 2;
      for (let i = 0; i < Math.min(count, areaExercises.length); i++) {
        exercises.push({ ...areaExercises[i] });
      }
    }
  });
  return {
    id: generateId(),
    name: (focus === 'full' ? 'Full Body' : focus.charAt(0).toUpperCase() + focus.slice(1)) + ' Workout',
    type: focus,
    exercises,
    totalDuration: duration,
    difficulty: difficulty as 'beginner' | 'intermediate' | 'advanced',
    createdAt: new Date()
  };
}

export const workoutPlanner: BuiltInSkill = {
  id: 'workout-planner',
  name: 'Workout Planner',
  description: 'Get personalized workout plans. Generate routines based on your goals, available equipment, and time.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '💪',
  category: 'personal',
  installCount: 3876,
  rating: 4.7,
  commands: [
    { name: 'generate', description: 'Generate a custom workout', usage: 'workout generate <focus> [duration] [difficulty]', examples: ['workout generate full 30 beginner'] },
    { name: 'quick', description: 'Get a quick workout routine', usage: 'workout quick [focus]', examples: ['workout quick', 'workout quick core'] },
    { name: 'list', description: 'List saved workouts', usage: 'workout list', examples: ['workout list'] },
    { name: 'exercise', description: 'Get details about an exercise', usage: 'workout exercise <name>', examples: ['workout exercise "push-ups"'] },
    { name: 'weekly', description: 'Generate a weekly workout plan', usage: 'workout weekly [difficulty]', examples: ['workout weekly'] }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'generate': {
        const focus = (params.arg0 as string)?.toLowerCase() || 'full';
        const duration = parseInt((params.arg1 as string)) || 30;
        const difficulty = (params.arg2 as string)?.toLowerCase() || 'intermediate';
        const validFocus = ['full', 'chest', 'back', 'legs', 'core', 'cardio', 'arms'];
        if (!validFocus.includes(focus)) {
          return { success: false, message: 'Invalid focus area. Choose from: ' + validFocus.join(', ') };
        }
        const workout = generateWorkout(focus, duration, difficulty);
        state.savedWorkouts.push(workout);
        let workoutText = 'GENERATED WORKOUT (' + workout.id + ')\n\n';
        workoutText += workout.name.toUpperCase() + '\n';
        workoutText += 'Duration: ~' + workout.totalDuration + ' min | Difficulty: ' + workout.difficulty + '\n\n';
        workoutText += 'EXERCISES:\n';
        workout.exercises.forEach((ex, i) => {
          workoutText += (i + 1) + '. ' + ex.name + ' - ' + ex.sets + ' sets x ' + ex.reps + '\n';
          workoutText += '   Equipment: ' + ex.equipment.join(', ') + '\n';
        });
        workoutText += '\nRemember to warm up before and stretch after!';
        return { success: true, message: workoutText };
      }
      case 'quick': {
        const focus = (params.arg0 as string)?.toLowerCase() || 'full';
        const workout = generateWorkout(focus, 15, 'beginner');
        let quickText = 'QUICK ' + (focus === 'full' ? 'FULL BODY' : focus.toUpperCase()) + ' WORKOUT (15 min)\n\n';
        workout.exercises.forEach((ex, i) => {
          quickText += '  ' + (i + 1) + '. ' + ex.name + ' - ' + ex.sets + 'x' + ex.reps + '\n';
        });
        quickText += '\nRest 30 seconds between sets.';
        return { success: true, message: quickText };
      }
      case 'list': {
        if (state.savedWorkouts.length === 0) {
          return { success: true, message: 'No saved workouts yet.\nGenerate one with "workout generate <focus>"' };
        }
        let listText = 'SAVED WORKOUTS\n\n';
        state.savedWorkouts.forEach((workout, i) => {
          listText += (i + 1) + '. ' + workout.name + ' (' + workout.id + ')\n';
          listText += '   ' + workout.totalDuration + ' min | ' + workout.difficulty + '\n\n';
        });
        return { success: true, message: listText };
      }
      case 'exercise': {
        const exerciseName = Object.values(params).join(' ').toLowerCase().replace(/^["']|["']$/g, '');
        if (!exerciseName) {
          return { success: false, message: 'Please specify an exercise. Usage: workout exercise <name>' };
        }
        let foundExercise: Exercise | null = null;
        for (const exercises of Object.values(exerciseDatabase)) {
          const match = exercises.find(e => e.name.toLowerCase().includes(exerciseName));
          if (match) { foundExercise = match; break; }
        }
        if (!foundExercise) {
          return { success: false, message: 'Exercise "' + exerciseName + '" not found.' };
        }
        let exerciseText = 'EXERCISE: ' + foundExercise.name.toUpperCase() + '\n\n';
        exerciseText += 'Target: ' + foundExercise.muscleGroup + '\n';
        exerciseText += 'Recommended: ' + foundExercise.sets + ' sets x ' + foundExercise.reps + '\n';
        exerciseText += 'Equipment: ' + foundExercise.equipment.join(', ');
        return { success: true, message: exerciseText };
      }
      case 'weekly': {
        const difficulty = (params.arg0 as string)?.toLowerCase() || 'intermediate';
        const days = [
          { day: 'Monday', focus: 'chest' },
          { day: 'Tuesday', focus: 'back' },
          { day: 'Wednesday', focus: 'cardio' },
          { day: 'Thursday', focus: 'legs' },
          { day: 'Friday', focus: 'arms' },
          { day: 'Saturday', focus: 'core' },
          { day: 'Sunday', focus: 'rest' }
        ];
        let weeklyText = 'WEEKLY WORKOUT PLAN (' + difficulty + ')\n\n';
        days.forEach(d => {
          if (d.focus === 'rest') {
            weeklyText += d.day + ': REST DAY\n\n';
          } else {
            weeklyText += d.day + ': ' + d.focus.toUpperCase() + ' (~30 min)\n\n';
          }
        });
        weeklyText += 'Use "workout generate <focus>" for daily details.';
        return { success: true, message: weeklyText };
      }
      default:
        return { success: false, message: 'Unknown command: ' + action + '. Available: generate, quick, list, exercise, weekly' };
    }
  }
};

export default workoutPlanner;
