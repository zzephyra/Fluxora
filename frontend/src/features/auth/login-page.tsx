import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CircleAlert, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { Button } from "../../components/ui/button";
import { Field, fieldErrorId } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { isAbortError, userFacingMessage } from "../../lib/api";
import { BrandLink } from "./account-menu";
import { login, sessionQueryKey } from "./api";
import { validateEmail, validatePassword } from "./types";
import { useSession } from "./use-session";
import { LoginShowcase } from "./login-showcase";
import "./login.css";

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) => login(input.email, input.password),
  });

  if (session.isPending) {
    return (
      <p className="studio flex min-h-screen items-center justify-center gap-2 text-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        正在确认登录状态
      </p>
    );
  }
  if (session.isSuccess) {
    return <Navigate replace to="/studio" />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError || nextPasswordError) {
      return;
    }
    try {
      const user = await loginMutation.mutateAsync({ email, password });
      queryClient.setQueryData(sessionQueryKey, user);
      navigate("/studio", { replace: true });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setFormError(userFacingMessage(error));
    }
  }

  return (
    <main className="studio login-page">
      <div className="login-form-side">
      <header className="login-header">
        <BrandLink />
        <Link className="login-home" to="/"><ArrowLeft size={14} /> 返回首页</Link>
      </header>
      <section className="login-form-container" aria-labelledby="login-heading">
        <p className="login-eyebrow"><span /> YOUR CREATIVE SPACE</p>
        <h1 id="login-heading">欢迎回来<span>。</span></h1>
        <p className="login-intro">回到你的创作空间，让灵感接着发生。</p>
        <form className="login-form" noValidate onSubmit={(event) => void onSubmit(event)}>
          <Field error={emailError} id="email" label="邮箱">
            <Input
              aria-describedby={emailError ? fieldErrorId("email") : undefined}
              aria-invalid={emailError ? true : undefined}
              autoCapitalize="none"
              autoComplete="username"
              id="email"
              inputMode="email"
              name="email"
              placeholder="you@example.com"
              className="login-input"
              onChange={(event) => setEmail(event.target.value)}
              spellCheck={false}
              type="email"
              value={email}
            />
          </Field>
          <Field error={passwordError} id="password" label="密码">
            <div className="password-field">
            <Input
              aria-describedby={passwordError ? fieldErrorId("password") : undefined}
              aria-invalid={passwordError ? true : undefined}
              autoComplete="current-password"
              id="password"
              name="password"
              placeholder="请输入你的密码"
              className="login-input password-input"
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <Button variant="ghost" className="password-toggle" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</Button>
            </div>
          </Field>
          {formError ? (
            <p className="flex items-center gap-2 text-danger" role="alert">
              <CircleAlert aria-hidden className="size-4 shrink-0" />
              {formError}
            </p>
          ) : null}
          <Button className="login-submit" disabled={loginMutation.isPending} type="submit">
            {loginMutation.isPending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : null}
            {loginMutation.isPending ? "正在登录" : "登录"}
            {!loginMutation.isPending && <ArrowUpRight size={18} aria-hidden />}
          </Button>
        </form>
        <div className="login-account-note"><ShieldCheck size={17} aria-hidden /><p>当前账号由管理员创建。<br /><span>需要开通账号或重置密码？请联系你的管理员。</span></p></div>
      </section>
      <footer className="login-footer"><span>© {new Date().getFullYear()} Fluxora</span><span>From context to cinema.</span></footer>
      </div>
      <LoginShowcase />
    </main>
  );
}
