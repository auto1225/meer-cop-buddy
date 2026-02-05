import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseShared } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableContainer } from "@/components/ResizableContainer";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import meercopLogo from "@/assets/meercop-logo.png";
import loginTreesBg from "@/assets/login-trees-bg.png";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
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
      if (isSignUp) {
        const { error } = await supabaseShared.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
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
            title: "회원가입 성공",
            description: "이메일 인증 후 로그인해주세요.",
          });
          setIsSignUp(false);
        }
      } else {
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

  const handleExit = () => {
    window.close();
  };

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

          {/* Login form */}
          <form onSubmit={handleAuth} className="w-full max-w-[200px] space-y-2">
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
              {isLoading ? "처리 중..." : isSignUp ? "회원가입" : "로그인"}
            </Button>
          </form>

          {/* Toggle signup/login */}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="mt-3 text-white/80 hover:text-white text-xs underline transition-colors"
            disabled={isLoading}
          >
            {isSignUp ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
          </button>
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
