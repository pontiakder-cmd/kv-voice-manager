import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  Timestamp 
} from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export const VAPID_KEY = 'BCCBByXTlrPFywJy4urI-MTFwYBS15U6OxaEgsJoFyXfCewKBLqN1QsOKHtzIduzMt1EHvFmhpPldJxQMqUW1cU';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

export interface ClientProfile {
  id: string;
  client: string;
  service: string;
  label: string;
  ownerId: string;
  createdAt: any;
}

export interface ProjectStage {
  status: 'pending' | 'in_progress' | 'review' | 'approved' | 'rejected';
  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;
  feedback?: string;
  staffIds?: string[];
  resultLink?: string;
}

export interface Project {
  id: string;
  projectCode?: string;
  client: string;
  title: string;
  duration: number;
  serviceType: 'dubbing' | 'subtitling' | 'transkreasi';
  status: 
    | 'project-entry' 
    | 'translation-phase'
    | 'editing-phase'
    | 'qc-phase'
    | 'done'
    | 'under-revision'
    | 'revision-review';
  
  // Team Assignments (User IDs)
  translators?: string[]; // Legacy/Migration support or for reference
  headTranslator: string;
  editors?: string[];
  headEditor: string;
  qcStaff?: string[];
  headQC: string;

  // Revision Tracking
  isRevision?: boolean;
  isPriority?: boolean; // New: Priority badge
  revisionCategory?: 'translation' | 'editing' | 'qc';
  revisionHistory?: {
    category: 'translation' | 'editing' | 'qc';
    feedback: string;
    requestedBy: string;
    createdAt: any;
  }[];

  // Stage Tracking
  stages: {
    translation: ProjectStage;
    editing: ProjectStage;
    qc: ProjectStage;
  };

  memberRoles?: { [userId: string]: UserRole };
  deadline?: any;

  // Asset Links
  scriptLink?: string;
  referenceLink?: string;

  // Capacity & Logs
  history?: {
    userId: string;
    action: string;
    timestamp: any;
    details?: string;
  }[];

  ownerId: string;
  isFinalReleased?: boolean;
  finalReleaseAt?: any;
  createdAt: any;
  updatedAt: any;
  lastStatusUpdateAt?: any; // For monitoring "Waiting for Update"
}

export interface ReminderSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string; // HH:mm
}

export type UserRole = 'pm' | 'translator' | 'head_translator' | 'editor' | 'head_editor' | 'qc' | 'head_qc' | 'client';

export interface UserProfile {
  name: string;
  role: UserRole;
  email?: string;
  fcmToken?: string;
  updatedAt?: any;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'assignment' | 'rejection' | 'update';
  read: boolean;
  projectId?: string;
  createdAt: any;
}

export interface Settings {
  reminders?: ReminderSettings;
  profile?: UserProfile;
}
