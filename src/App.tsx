import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authSlice";
import { AppRoutes } from "@/routes";

export default function App() {
  const { setSession, fetchProfile } = useAuthStore();

  useEffect(() => {
    // hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          useAuthStore.setState({ profile: null, role: null, loading: false });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setSession, fetchProfile]);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}