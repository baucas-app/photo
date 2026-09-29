import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuth();

  useEffect(() => {
    const error = params.get("error");
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const userId = params.get("userId");
    const email = params.get("email");
    const name = params.get("name");

    if (error || !accessToken || !refreshToken || !userId || !email) {
      navigate("/login?error=oauth_failed", { replace: true });
      return;
    }

    loginWithTokens({ accessToken, refreshToken, userId, email, name: name ?? undefined });
    navigate("/", { replace: true });
  }, [params, navigate, loginWithTokens]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <p>Anmeldung wird abgeschlossen…</p>
    </div>
  );
}
