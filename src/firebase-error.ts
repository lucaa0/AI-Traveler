import { auth } from './firebase';
import { toast } from 'sonner';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Display specific, user-friendly toast messages based on common Firestore errors
  if (errorMessage.includes('Missing or insufficient permissions') || errorMessage.includes('permission-denied')) {
    toast.error(`Permission denied while trying to ${operationType} data. Please check your access rights.`);
  } else if (errorMessage.includes('not-found') || errorMessage.includes('No document to update')) {
    toast.error(`The requested data could not be found (Operation: ${operationType}).`);
  } else if (errorMessage.includes('offline') || errorMessage.includes('Failed to get document because the client is offline')) {
    toast.error('You appear to be offline. Please check your internet connection.');
  } else if (errorMessage.includes('Quota exceeded')) {
    toast.error('Database quota exceeded. Please try again later.');
  } else {
    toast.error(`An error occurred during ${operationType}: ${errorMessage}`);
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
