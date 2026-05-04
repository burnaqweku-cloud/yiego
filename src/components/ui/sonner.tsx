import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/* ── Smart duration based on text length ── */
export function getToastDuration(message?: string | React.ReactNode): number {
  if (!message) return 4000;
  const text = typeof message === "string" ? message : String(message);
  const len = text.length;
  if (len <= 30) return 2500;
  if (len <= 70) return 4000;
  if (len <= 140) return 6000;
  return 8000;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      offset={80}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: [
            "group toast",
            "!rounded-2xl !px-4 !py-3.5",
            "!text-foreground !text-sm !font-medium",
            "!min-w-[300px] !max-w-[380px]",
            "ds-toast",
          ].join(" "),
          title: "!text-sm !font-semibold !text-foreground",
          description: "!text-xs !text-muted-foreground !mt-0.5",
          actionButton:
            "!bg-primary !text-primary-foreground !text-xs !font-semibold !rounded-lg !px-3 !py-1.5",
          cancelButton:
            "!bg-muted !text-muted-foreground !text-xs !rounded-lg !px-3 !py-1.5",
          closeButton:
            "!bg-white/80 !border-border/40 !text-muted-foreground hover:!bg-muted !rounded-lg",
          icon: "!w-5 !h-5",
          success: "ds-toast-success",
          error: "ds-toast-error",
          warning: "ds-toast-warning",
          info: "ds-toast-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
