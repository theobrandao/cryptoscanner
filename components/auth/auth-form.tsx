"use client";

import * as React from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, Skeleton } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";
import { trackClient } from "@/lib/analytics-client";
import { AUTH_MESSAGES, fieldErrorsFromDetails, passwordMissing, validateAuthFields, type AuthField } from "@/lib/validation/auth-messages";

/** Marca do Google (quatro cores) para o botão de login. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1C3.2 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.2C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l4.1-3.1z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l4.1 3.1c.9-2.9 3.6-5 6.7-5z" />
    </svg>
  );
}

/** Erro de um campo, logo abaixo dele. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="text-xs text-danger">
      {message}
    </span>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const { refresh } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [invite, setInvite] = React.useState("");
  // null = ainda consultando o servidor (o espaço fica reservado para não empurrar o formulário)
  const [inviteRequired, setInviteRequired] = React.useState<boolean | null>(mode === "register" ? null : false);
  const [accept, setAccept] = React.useState(false);
  const [google, setGoogle] = React.useState<boolean | null>(null);
  const [termsHint, setTermsHint] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<AuthField, string>>>({});

  React.useEffect(() => {
    let alive = true;
    postJson<{ enabled: boolean }>("/api/auth/google", {})
      .then((d) => {
        if (alive) setGoogle(d.enabled);
      })
      .catch(() => {
        if (alive) setGoogle(false);
      });
    if (mode === "register") {
      trackClient("signup_view");
      apiFetch<{ inviteRequired: boolean }>("/api/auth/register")
        .then((d) => {
          if (alive) setInviteRequired(d.inviteRequired);
        })
        .catch(() => {
          if (alive) setInviteRequired(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [mode]);

  const clearFieldError = (f: AuthField) => setFieldErrors((prev) => (prev[f] ? { ...prev, [f]: undefined } : prev));
  const missing = mode === "register" ? passwordMissing(password) : [];

  const ERROS: Record<string, string> = {
    google_cancelado: "Login com Google cancelado.",
    google_estado: "A sessão do login com Google expirou. Tente de novo.",
    google_falhou: "Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.",
    google_termos: "Para criar a conta com o Google, marque o aceite dos Termos e clique de novo em Continuar com Google.",
    google_indisponivel: "Login com Google indisponível no momento.",
    cadastro_restrito: "Cadastro restrito nesta fase.",
    conta_bloqueada: "Conta bloqueada. Fale com o suporte.",
  };
  const urlError = params.get("erro") ? (ERROS[params.get("erro")!] ?? "Falha no login.") : null;

  const googleHref = `/api/auth/google?next=${encodeURIComponent(next)}${mode === "register" ? "&accept=1" : ""}`;
  const onGoogle = (e: React.MouseEvent) => {
    if (mode === "register" && !accept) {
      e.preventDefault();
      setTermsHint(true);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const local = validateAuthFields(mode, { name, email, password, accept });
    setFieldErrors(local);
    if (Object.values(local).some(Boolean)) return;
    setLoading(true);
    try {
      if (mode === "register") await postJson("/api/auth/register", { name, email, password, acceptTerms: accept, ...(invite ? { invite } : {}) });
      else await postJson("/api/auth/login", { email, password });
      await refresh();
      // só caminhos internos: "/x" sim; "//host" e "/\\host" não (open redirect)
      router.push(/^\/(?![/\\])/.test(next) ? next : "/");
    } catch (err) {
      if (err instanceof ApiClientError) {
        const byField = fieldErrorsFromDetails(err.details);
        setFieldErrors(byField);
        // erro de validação: o texto fica junto a cada campo; o alerta geral só resume
        setError(Object.values(byField).some(Boolean) ? "Confira os campos destacados." : err.message);
      } else setError("Falha inesperada. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} {mode === "login" ? "Entrar" : "Criar conta"}
        </CardTitle>
        <CardDescription>
          {mode === "login" ? "Acesse seus agentes, alertas e favoritos." : `${TRIAL_DAYS} dias grátis no PRO, sem cartão. Depois, PRO ou ELITE.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "login" && params.get("reset") === "1" ? (
          <Alert variant="success" className="mb-3">
            Senha redefinida. Entre com a nova senha.
          </Alert>
        ) : null}
        {urlError ? (
          <Alert variant="danger" className="mb-3">
            {urlError}
          </Alert>
        ) : null}
        {google === null ? (
          <div className="mb-4 flex flex-col gap-2" aria-hidden>
            <Skeleton className="h-11 w-full" />
            <div className="h-4" />
          </div>
        ) : google ? (
          <div className="mb-4 flex flex-col gap-2">
            <a
              href={googleHref}
              onClick={onGoogle}
              data-testid="google-login"
              className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted"
            >
              <GoogleMark />
              {mode === "login" ? "Entrar com Google" : "Continuar com Google"}
            </a>
            {termsHint && !accept ? <span className="text-xs text-warning">Marque o aceite dos Termos abaixo e clique de novo.</span> : null}
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou com e-mail
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        ) : null}
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
          {mode === "register" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFieldError("name");
                }}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              <FieldError id="name-error" message={fieldErrors.name} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
              required
              autoComplete="email"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            <FieldError id="email-error" message={fieldErrors.email} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError("password");
                }}
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="pr-11"
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={[mode === "register" ? "password-hint" : "", fieldErrors.password ? "password-error" : ""].filter(Boolean).join(" ") || undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-controls="password"
                className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            {mode === "register" ? (
              <span id="password-hint" className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                {password.length === 0 ? (
                  "Mínimo de 8 caracteres com letras e números."
                ) : missing.length ? (
                  `Falta: ${missing.join(", ")}.`
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Senha dentro da regra.
                  </>
                )}
              </span>
            ) : null}
            <FieldError id="password-error" message={fieldErrors.password} />
          </div>
          {mode === "register" && inviteRequired === null ? <Skeleton className="h-[74px] w-full" aria-hidden /> : null}
          {mode === "register" && inviteRequired ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="invite">Código de convite</Label>
              <Input id="invite" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" />
              <span className="text-xs text-muted-foreground">Cadastro por convite nesta fase.</span>
            </div>
          ) : null}
          {mode === "register" ? (
            <label className="flex min-h-11 items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <input
                id="accept-terms"
                type="checkbox"
                checked={accept}
                onChange={(e) => {
                  setAccept(e.target.checked);
                  clearFieldError("acceptTerms");
                }}
                required
                aria-describedby={!accept ? "accept-hint" : undefined}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
              />
              <span>
                Li e aceito os{" "}
                <Link href="/termos" target="_blank" className="text-primary underline">
                  Termos de Uso
                </Link>
                , a{" "}
                <Link href="/privacidade" target="_blank" className="text-primary underline">
                  Política de Privacidade
                </Link>{" "}
                e a{" "}
                <Link href="/reembolso" target="_blank" className="text-primary underline">
                  Política de Cancelamento e Reembolso
                </Link>
                . Entendo que o CryptoScanner é ferramenta de análise técnica e não faz recomendação de investimento.
              </span>
            </label>
          ) : null}
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Button type="submit" loading={loading} disabled={mode === "register" && !accept}>
            {mode === "login" ? "Entrar" : `Começar ${TRIAL_DAYS} dias grátis`}
          </Button>
          {mode === "register" && !accept ? (
            <span id="accept-hint" className="-mt-1 text-center text-xs text-muted-foreground">
              {AUTH_MESSAGES.termsRequired}
            </span>
          ) : null}
          {mode === "login" ? (
            <Link href="/esqueci-senha" className="inline-flex min-h-10 items-center justify-center text-xs text-muted-foreground hover:text-foreground">
              Esqueci minha senha
            </Link>
          ) : null}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <Link href={`/registro?next=${encodeURIComponent(next)}`} className="text-primary hover:underline">
                Cadastre-se
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-primary hover:underline">
                Entrar
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
