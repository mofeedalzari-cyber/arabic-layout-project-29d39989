import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { notifyNetworkAgents } from "@/lib/push.functions";

/** بطاقة إرسال رسالة تنبيه من مدير الشبكة إلى كل المناديب */
export function AnnounceAgentsCard() {
  const { profile, user } = useAuth();
  const networkId = profile?.network_id ?? null;
  const [title, setTitle] = useState("تنبيه من الإدارة");
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!networkId) throw new Error("لا توجد شبكة مرتبطة بحسابك");
      const t = title.trim();
      const b = body.trim();
      if (!t || !b) throw new Error("أدخل عنوان ونص الرسالة");

      const { error } = await supabase.from("announcements").insert({
        network_id: networkId,
        sender_id: user?.id ?? null,
        sender_name: profile?.full_name ?? profile?.username ?? null,
        title: t,
        body: b,
      });
      if (error) throw error;

      await notifyNetworkAgents({ data: { networkId, title: t, body: b } }).catch(() => null);
    },
    onSuccess: () => {
      toast.success("تم إرسال التنبيه لجميع المناديب");
      setBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="card-elegant border-0 p-5 max-w-md mt-6 space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <BellRing className="h-4 w-4 text-primary" /> رسالة تنبيه للمناديب
      </div>
      <p className="text-xs text-muted-foreground">
        تُرسل الرسالة لكل مناديب شبكتك كإشعار داخل التطبيق وإشعار أعلى الشاشة.
      </p>
      <div className="space-y-2">
        <Label className="text-xs">العنوان</Label>
        <Input
          aria-label="عنوان التنبيه"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">نص الرسالة</Label>
        <Textarea
          aria-label="نص التنبيه"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={400}
          rows={3}
          className="rounded-xl"
          placeholder="اكتب التنبيه هنا..."
        />
      </div>
      <Button
        disabled={send.isPending}
        onClick={() => send.mutate()}
        className="w-full rounded-xl gradient-primary-bg border-0 font-semibold"
      >
        <Send className="h-4 w-4 ml-1" />
        {send.isPending ? "جارٍ الإرسال..." : "إرسال التنبيه"}
      </Button>
    </Card>
  );
}
