import { useAuth } from '@oxy.so/services/ui/client';

/** Who is looking. `ready` is false until Oxy has resolved the session either way. */
export function useViewer() {
  const { isAuthenticated, isAuthResolved, user, signIn, signOut } = useAuth();
  return { signedIn: isAuthenticated, ready: isAuthResolved, user, signIn, signOut };
}
