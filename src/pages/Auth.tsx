import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseShared } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableContainer } from "@/components/ResizableContainer";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import meercopLogo from "@/assets/meercop-logo.png";
import loginTreesBg from "@/assets/login-trees-bg.png";

type AuthStep = "login" | "signup" | "verify-otp";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>("login");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast({
        title: "입력 오류",
        description: "이메일과 비밀번호를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabaseShared.auth.signUp({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast({
            title: "회원가입 실패",
            description: "이미 등록된 이메일입니다. 로그인을 시도해주세요.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "인증 코드 전송",
          description: "이메일로 6자리 인증 코드가 전송되었습니다.",
        });
        setAuthStep("verify-otp");
      }
    } catch (error: any) {
      toast({
        title: "오류 발생",
        description: error.message || "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast({
        title: "입력 오류",
        description: "6자리 인증 코드를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabaseShared.auth.verifyOtp({
        email,
        token: otp,
        type: "signup",
      });

      if (error) {
        toast({
          title: "인증 실패",
          description: "인증 코드가 올바르지 않습니다. 다시 확인해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "회원가입 완료",
          description: "환영합니다!",
        });
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "오류 발생",
        description: error.message || "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast({
        title: "입력 오류",
        description: "이메일과 비밀번호를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabaseShared.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: "로그인 실패",
            description: "이메일 또는 비밀번호가 올바르지 않습니다.",
            variant: "destructive",
          });
        } else if (error.message.includes("Email not confirmed")) {
          toast({
            title: "로그인 실패",
            description: "이메일 인증이 필요합니다. 이메일을 확인해주세요.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "오류 발생",
        description: error.message || "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabaseShared.auth.resend({
        type: "signup",
        email,
      });

      if (error) throw error;

      toast({
        title: "코드 재전송",
        description: "새로운 인증 코드가 이메일로 전송되었습니다.",
      });
    } catch (error: any) {
      toast({
        title: "오류 발생",
        description: error.message || "코드 재전송에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExit = () => {
    window.close();
  };

  const renderOtpVerification = () => (
    <form onSubmit={handleVerifyOtp} className="w-full max-w-[240px] space-y-4">
      <div className="text-center mb-4">
        <p className="text-white text-sm mb-1">인증 코드 입력</p>
        <p className="text-white/70 text-xs">{email}로 전송된 6자리 코드</p>
      </div>
      
      <div className="flex justify-center">
        <InputOTP
          value={otp}
          onChange={setOtp}
          maxLength={6}
          disabled={isLoading}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="bg-white/90 border-0 text-foreground" />
            <InputOTPSlot index={1} className="bg-white/90 border-0 text-foreground" />
            <InputOTPSlot index={2} className="bg-white/90 border-0 text-foreground" />
            <InputOTPSlot index={3} className="bg-white/90 border-0 text-foreground" />
            <InputOTPSlot index={4} className="bg-white/90 border-0 text-foreground" />
            <InputOTPSlot index={5} className="bg-white/90 border-0 text-foreground" />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button
        type="submit"
        disabled={isLoading || otp.length !== 6}
        className="w-full h-9 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold rounded-full text-sm"
      >
        {isLoading ? "확인 중..." : "확인"}
      </Button>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleResendOtp}
          className="text-white/80 hover:text-white text-xs underline transition-colors"
          disabled={isLoading}
        >
          인증 코드 재전송
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthStep("signup");
            setOtp("");
          }}
          className="text-white/60 hover:text-white/80 text-xs transition-colors"
          disabled={isLoading}
        >
          이메일 다시 입력
        </button>
      </div>
    </form>
  );

  const renderAuthForm = () => (
    <>
      <form onSubmit={authStep === "login" ? handleLogin : handleSignUp} className="w-full max-w-[200px] space-y-2">
        <Input
          type="email"
          placeholder="test001@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 bg-white/90 border-0 rounded-md text-foreground placeholder:text-muted-foreground/60 text-center text-sm"
          disabled={isLoading}
        />
        <Input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 bg-white/90 border-0 rounded-md text-foreground placeholder:text-muted-foreground/60 text-center text-sm"
          disabled={isLoading}
        />

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-9 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold rounded-full text-sm mt-3"
        >
          {isLoading ? "처리 중..." : authStep === "signup" ? "회원가입" : "로그인"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setAuthStep(authStep === "login" ? "signup" : "login")}
        className="mt-3 text-white/80 hover:text-white text-xs underline transition-colors"
        disabled={isLoading}
      >
        {authStep === "signup" ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
      </button>
    </>
  );

  return (
    <ResizableContainer
      initialWidth={300}
      initialHeight={520}
      minWidth={200}
      minHeight={347}
      maxWidth={450}
      maxHeight={780}
      baseWidth={300}
      baseHeight={520}
    >
      <div className="w-full h-full sky-background flex flex-col relative overflow-hidden">
        {/* Exit button - top right */}
        <div className="absolute top-3 right-3 z-20">
          <button 
            onClick={handleExit}
            className="flex flex-col items-center text-white/80 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-[10px] mt-0.5">종료</span>
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 z-10">
          {/* Logo */}
          <div className="mb-6">
            <img 
              src={meercopLogo} 
              alt="MeerCOP" 
              className="h-16 object-contain"
            />
          </div>

          {authStep === "verify-otp" ? renderOtpVerification() : renderAuthForm()}
        </div>

        {/* Trees background at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-0">
          <img 
            src={loginTreesBg} 
            alt="" 
            className="w-full object-cover object-bottom"
            style={{ maxHeight: '120px' }}
          />
        </div>
      </div>
    </ResizableContainer>
  );
}
