import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Store, User, FileText, CheckCircle2, Zap, AlertCircle, LogIn, UserPlus, Save } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';

const GHANA_REGIONS = [
  'Greater Accra', 'Ashanti', 'Eastern', 'Central', 'Western', 'Western North',
  'Volta', 'Oti', 'Northern', 'Savannah', 'North East', 'Upper East',
  'Upper West', 'Bono', 'Bono East', 'Ahafo',
];

const SELLING_CHANNELS = [
  'WhatsApp Status & Broadcast',
  'WhatsApp Groups',
  'Telegram',
  'TikTok / Instagram',
  'Facebook / X',
  'Physical shop / kiosk',
  'Friends & family',
  'Other',
];

const CUSTOMER_RANGES = ['0–10', '11–50', '51–100', '101–250', '251–500', '501–1,000', '1,000+'];

const DRAFT_KEY = 'datasika_agent_draft';

/** Returns field-level errors for a given step */
const getStepErrors = (
  step: number,
  fields: Record<string, any>
): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (step === 1) {
    if (!fields.storeName?.trim()) errors.storeName = 'Store name is required';
    if (!fields.storeDescription?.trim()) errors.storeDescription = 'Store description is required';
    if (!fields.whatsappNumber?.trim()) errors.whatsappNumber = 'WhatsApp number is required';
    if (!fields.storeEmail?.trim()) errors.storeEmail = 'Store email is required';
    if (!fields.region) errors.region = 'Region is required';
  } else if (step === 2) {
    if (!fields.fullName?.trim()) errors.fullName = 'Full name is required';
    if (!fields.personalRegion) errors.personalRegion = 'Region/City is required';
    if (fields.soldBefore === null || fields.soldBefore === undefined) errors.soldBefore = 'Please select Yes or No';
  } else if (step === 3) {
    if (!fields.expectedCustomers) errors.expectedCustomers = 'Select expected customers';
    if (!fields.sellingChannels || fields.sellingChannels.length === 0) errors.sellingChannels = 'Select at least one selling method';
    if (!fields.agreedNoScam) errors.agreedNoScam = 'Required';
    if (!fields.agreedSuspension) errors.agreedSuspension = 'Required';
    if (!fields.agreedWrongNumbers) errors.agreedWrongNumbers = 'Required';
    if (!fields.agreedAccurateInfo) errors.agreedAccurateInfo = 'Required';
  }
  return errors;
};

const BecomeAgent = () => {
  const { user, loading: authLoading } = useAuth();
  const { agent, application, loading: agentLoading, refresh: refreshAgent } = useAgent();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // Step 1
  const [storeName, setStoreName] = useState('');
  const [storeDescription, setStoreDescription] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');

  // Step 2 — Personal Info
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [personalRegion, setPersonalRegion] = useState('');
  const [personalCity, setPersonalCity] = useState('');
  const [promotionNote, setPromotionNote] = useState('');
  const [soldBefore, setSoldBefore] = useState<boolean | null>(null);

  // Step 3 — Business Plan + Agreements
  const [expectedCustomers, setExpectedCustomers] = useState('');
  const [sellingChannels, setSellingChannels] = useState<string[]>([]);
  const [otherChannelText, setOtherChannelText] = useState('');
  const [customerLocation, setCustomerLocation] = useState('');
  const [hasCustomerBase, setHasCustomerBase] = useState<boolean | null>(null);
  const [agreedNoScam, setAgreedNoScam] = useState(false);
  const [agreedSuspension, setAgreedSuspension] = useState(false);
  const [agreedWrongNumbers, setAgreedWrongNumbers] = useState(false);
  const [agreedAccurateInfo, setAgreedAccurateInfo] = useState(false);

  const allFields = {
    storeName, storeDescription, whatsappNumber, storeEmail, region,
    fullName, personalRegion, soldBefore,
    expectedCustomers, sellingChannels, agreedNoScam, agreedSuspension, agreedWrongNumbers, agreedAccurateInfo,
  };

  // Load draft on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        const d = JSON.parse(draft);
        if (d.storeName) setStoreName(d.storeName);
        if (d.storeDescription) setStoreDescription(d.storeDescription);
        if (d.whatsappNumber) setWhatsappNumber(d.whatsappNumber);
        if (d.storeEmail) setStoreEmail(d.storeEmail);
        if (d.region) setRegion(d.region);
        if (d.city) setCity(d.city);
        if (d.fullName) setFullName(d.fullName);
        if (d.dateOfBirth) setDateOfBirth(d.dateOfBirth);
        if (d.personalRegion) setPersonalRegion(d.personalRegion);
        if (d.personalCity) setPersonalCity(d.personalCity);
        if (d.promotionNote) setPromotionNote(d.promotionNote);
        if (d.soldBefore !== undefined && d.soldBefore !== null) setSoldBefore(d.soldBefore);
        if (d.sellingChannels) setSellingChannels(d.sellingChannels);
        if (d.otherChannelText) setOtherChannelText(d.otherChannelText);
        if (d.expectedCustomers) setExpectedCustomers(d.expectedCustomers);
        if (d.customerLocation) setCustomerLocation(d.customerLocation);
        if (d.hasCustomerBase !== undefined && d.hasCustomerBase !== null) setHasCustomerBase(d.hasCustomerBase);
        if (d.agreedNoScam) setAgreedNoScam(d.agreedNoScam);
        if (d.agreedSuspension) setAgreedSuspension(d.agreedSuspension);
        if (d.agreedWrongNumbers) setAgreedWrongNumbers(d.agreedWrongNumbers);
        if (d.agreedAccurateInfo) setAgreedAccurateInfo(d.agreedAccurateInfo);
        if (d.step) setStep(d.step);
      }
    } catch {}
  }, []);

  // Auto-save draft
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        storeName, storeDescription, whatsappNumber, storeEmail, region, city,
        fullName, dateOfBirth, personalRegion, personalCity, promotionNote,
        soldBefore, sellingChannels, otherChannelText,
        expectedCustomers, customerLocation, hasCustomerBase, step,
        agreedNoScam, agreedSuspension, agreedWrongNumbers, agreedAccurateInfo,
      }));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch {}
  }, [storeName, storeDescription, whatsappNumber, storeEmail, region, city, fullName, dateOfBirth, personalRegion, personalCity, promotionNote, soldBefore, sellingChannels, otherChannelText, expectedCustomers, customerLocation, hasCustomerBase, step, agreedNoScam, agreedSuspension, agreedWrongNumbers, agreedAccurateInfo]);

  useEffect(() => { saveDraft(); }, [saveDraft]);

  // For LOGGED-IN users: redirect if they already have an agent record
  useEffect(() => {
    if (!user) return; // Guest — no redirect
    if (agentLoading) return;
    if (agent && agent.status !== 'deleted') {
      const dashboardStatuses = ['pending_review', 'approved', 'active'];
      if (dashboardStatuses.includes(agent.status)) {
        navigate('/agent/dashboard');
      }
    }
  }, [agentLoading, user, agent, navigate]);

  // Auto-submit after login redirect (intent=agent_apply&action=submit)
  useEffect(() => {
    if (!user || authLoading || agentLoading) return;
    const intent = searchParams.get('intent');
    const action = searchParams.get('action');
    if (intent === 'agent_apply' && action === 'submit' && !autoSubmitting && !submitted) {
      // Check if draft has data
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const d = JSON.parse(draft);
          if (d.storeName && d.fullName && d.expectedCustomers) {
            setAutoSubmitting(true);
            // Slight delay to let state settle
            setTimeout(() => {
              handleAutoSubmit();
            }, 500);
          }
        } catch {}
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, agentLoading, searchParams]);

  // Loading state only for logged-in users checking agent status
  if (user && (authLoading || agentLoading)) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="spinner spinner-lg" />
        </div>
      </Layout>
    );
  }

  // Rejected/suspended status (deleted stores are treated as non-existent) — only for logged-in users
  if (user && agent && agent.status !== 'deleted' && !['pending_review', 'approved', 'active'].includes(agent.status)) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-12 animate-page-in">
          <Card className="card-shadow">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7 text-destructive" />
              </div>
              <div className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold badge-failed">
                {agent.status === 'suspended' ? 'Suspended' : 'Rejected'}
              </div>
              <h2 className="text-xl font-bold">Store "{agent.store_name}"</h2>
              <p className="text-muted-foreground text-sm">
                {agent.status === 'suspended'
                  ? 'Your agent store has been suspended. Please contact support.'
                  : 'Your application was not approved at this time. You may re-apply.'}
              </p>
              {agent.status === 'rejected' && (
                <Button onClick={() => { setStep(1); }} className="gap-2 btn-press">
                  Re-apply <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Success screen — redirect to confirmation page
  if (submitted) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-12 animate-page-in">
          <Card className="card-shadow">
            <CardContent className="p-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Application Submitted!</h2>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-semibold">
                  Status: Pending Review
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Your agent application has been submitted.</p>
                <p className="font-medium">You are not an active agent yet — we will review your application and notify you.</p>
              </div>
              <div className="space-y-2 pt-2">
                <Button onClick={() => navigate('/dashboard')} className="w-full gap-2 btn-press">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" onClick={() => navigate('/agent/dashboard')} className="w-full gap-2 btn-press text-sm">
                  View Application Status
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Auto-submit loading
  if (autoSubmitting) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <div className="spinner spinner-lg" />
          <p className="text-sm text-muted-foreground font-medium">Submitting your application...</p>
        </div>
      </Layout>
    );
  }

  const validateStep = (s: number) => {
    const errors = getStepErrors(s, allFields);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    const errors = getStepErrors(step, allFields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please fill all required fields');
      return;
    }
    setFieldErrors({});
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setFieldErrors({});
    setSubmitError(null);
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSellingChannel = (channel: string) => {
    setSellingChannels(prev =>
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
    );
  };

  /** Log failed submission to agent_application_errors table */
  const logSubmissionError = async (userId: string, payload: Record<string, any>, errorMsg: string, errorCode?: string) => {
    try {
      const sanitized = { ...payload };
      delete sanitized.date_of_birth;

      await supabase.from('agent_application_errors' as any).insert({
        user_id: userId,
        payload: sanitized,
        error_message: errorMsg,
        error_code: errorCode || null,
      });
    } catch (logErr) {
      console.error('Failed to log application error:', logErr);
    }
  };

  const doSubmit = async (currentUser: { id: string; email?: string }) => {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    // Build selling_method from channels
    const channelsList = [...sellingChannels];
    if (channelsList.includes('Other') && otherChannelText.trim()) {
      const idx = channelsList.indexOf('Other');
      channelsList[idx] = `Other: ${otherChannelText.trim()}`;
    }
    const sellingMethod = channelsList.length > 0
      ? channelsList.join(', ')
      : 'Not specified';

    const payload = {
      user_id: currentUser.id,
      store_name: storeName.trim(),
      store_description: storeDescription.trim(),
      whatsapp_number: whatsappNumber.trim(),
      store_email: storeEmail.trim(),
      region: city ? `${region}, ${city}` : region,
      full_name: fullName.trim(),
      date_of_birth: dateOfBirth || null,
      personal_phone: whatsappNumber.trim(),
      personal_email: currentUser.email || null,
      selling_method: sellingMethod,
      expected_customers: expectedCustomers,
      sold_before: !!soldBefore,
      referral_source: [
        customerLocation ? `Location: ${customerLocation}` : '',
        hasCustomerBase !== null ? `Has customer base: ${hasCustomerBase ? 'Yes' : 'No'}` : '',
        promotionNote ? `Promotion plan: ${promotionNote.trim()}` : '',
      ].filter(Boolean).join(' | ') || null,
      agreed_no_scam: agreedNoScam,
      agreed_min_price: true,
      agreed_suspension: agreedSuspension,
    };

    try {
      // Idempotency check: don't create duplicate
      const { data: existing } = await supabase
        .from('agent_applications' as any)
        .select('id, status')
        .eq('user_id', currentUser.id)
        .in('status', ['pending_review', 'pending'])
        .limit(1)
        .maybeSingle();

      if (existing) {
        localStorage.removeItem(DRAFT_KEY);
        toast.success('You already have a pending application!');
        await refreshAgent();
        setSubmitted(true);
        return;
      }

      const { error } = await supabase.from('agent_applications' as any).insert(payload);

      if (error) {
        console.error('Agent application submission error:', error.message, error.code, error.details);
        await logSubmissionError(currentUser.id, payload, error.message, error.code);
        setSubmitError(error.message);
        toast.error('Something went wrong. Please try again.');
        return;
      }

      localStorage.removeItem(DRAFT_KEY);
      toast.success('Application submitted successfully!');

      // Fire-and-forget agent application SMS
      try {
        supabase.functions.invoke('send-sms', {
          body: {
            to: whatsappNumber.trim(),
            event_type: 'agent_application_received',
            user_id: currentUser.id,
          },
        }).catch(() => {});
      } catch {}

      await refreshAgent();
      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.message || 'Unknown error occurred';
      console.error('Agent application unexpected error:', msg);
      await logSubmissionError(currentUser.id, payload, msg);
      setSubmitError(msg);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
      setAutoSubmitting(false);
    }
  };

  const handleAutoSubmit = async () => {
    if (!user) return;
    await doSubmit({ id: user.id, email: user.email || undefined });
  };

  const handleSubmit = async () => {
    const errors = getStepErrors(3, allFields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please complete all required fields and agreements');
      return;
    }

    // If not logged in — show login modal
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    await doSubmit({ id: user.id, email: user.email || undefined });
  };

  const handleLoginRedirect = (tab: 'login' | 'signup') => {
    // Save draft before redirecting
    saveDraft();
    setShowLoginModal(false);
    navigate(`/auth?tab=${tab}&next=${encodeURIComponent('/become-an-agent?intent=agent_apply&action=submit')}`);
  };

  const stepLabels = ['Store Info', 'About You', 'Business Plan'];
  const stepIcons = [Store, User, FileText];
  const isStepValid = validateStep(step);

  const fieldErrorClass = (field: string) =>
    fieldErrors[field] ? 'border-destructive ring-1 ring-destructive/30' : '';

  return (
    <Layout>
      <SEOHead
        title="Become a DataSika Agent — Start Selling Data | DataSika"
        description="Apply to become a DataSika agent. Sell MTN, Telecel & AirtelTigo data bundles and earn commissions. Apply in 3 minutes."
        path="/become-an-agent"
      />
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 animate-page-in">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Become a DataSika Agent
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apply in 3 minutes — start earning today
          </p>
          {!user && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              No account needed to start — sign in when you're ready to submit.
            </p>
          )}
        </div>

        {/* Sticky step indicator */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-4 pt-2 -mx-4 px-4 border-b border-border mb-6">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3].map((s) => {
              const Icon = stepIcons[s - 1];
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    step > s
                      ? 'bg-primary text-primary-foreground'
                      : step === s
                        ? 'bg-primary/10 text-primary border-2 border-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {step > s ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${step >= s ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {stepLabels[s - 1]}
                  </span>
                  {s < 3 && <div className={`hidden sm:block w-8 h-0.5 mx-1 ${step > s ? 'bg-primary' : 'bg-border'}`} />}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">
              Step {step} of 3 — {stepLabels[step - 1]}
            </p>
            {/* Guest autosave indicator */}
            {!user && draftSaved && (
              <span className="flex items-center gap-1 text-[10px] text-primary font-medium animate-page-in">
                <Save className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        </div>

        {/* Resume banner for returning guests */}
        {!user && step > 1 && storeName && (
          <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs text-foreground font-medium">
              Continue where you left off — your progress is saved.
            </p>
          </div>
        )}

        {/* Submit error banner */}
        {submitError && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-2 animate-page-in">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">Something went wrong. Please try again.</p>
              <p className="text-xs text-muted-foreground mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        {/* Form card */}
        <Card className="card-shadow overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="agent-step-transition">
              {/* ====== STEP 1 — Store Info ====== */}
              {step === 1 && (
                <div className="space-y-4 animate-page-in">
                  <div>
                    <Label className="text-sm font-semibold">Preferred Store Name *</Label>
                    <Input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="e.g. FastData GH" className={`mt-1.5 h-11 ${fieldErrorClass('storeName')}`} />
                    {fieldErrors.storeName && <p className="text-xs text-destructive mt-1">{fieldErrors.storeName}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">This will be visible to customers on your store page.</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Store Description *</Label>
                    <Textarea value={storeDescription} onChange={e => setStoreDescription(e.target.value)} placeholder="Describe what your store offers" rows={3} className={`mt-1.5 ${fieldErrorClass('storeDescription')}`} />
                    {fieldErrors.storeDescription && <p className="text-xs text-destructive mt-1">{fieldErrors.storeDescription}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Store WhatsApp Number *</Label>
                    <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="0551234567" className={`mt-1.5 h-11 ${fieldErrorClass('whatsappNumber')}`} />
                    {fieldErrors.whatsappNumber && <p className="text-xs text-destructive mt-1">{fieldErrors.whatsappNumber}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Store Email Address *</Label>
                    <Input type="email" value={storeEmail} onChange={e => setStoreEmail(e.target.value)} placeholder="store@example.com" className={`mt-1.5 h-11 ${fieldErrorClass('storeEmail')}`} />
                    {fieldErrors.storeEmail && <p className="text-xs text-destructive mt-1">{fieldErrors.storeEmail}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Region *</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger className={`mt-1.5 h-11 ${fieldErrorClass('region')}`}><SelectValue placeholder="Select region" /></SelectTrigger>
                      <SelectContent>{GHANA_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                    {fieldErrors.region && <p className="text-xs text-destructive mt-1">{fieldErrors.region}</p>}
                  </div>
                  {region && (
                    <div className="animate-page-in">
                      <Label className="text-sm font-semibold">City (optional)</Label>
                      <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Kumasi, Tamale" className="mt-1.5 h-11" />
                    </div>
                  )}
                </div>
              )}

              {/* ====== STEP 2 — About You ====== */}
              {step === 2 && (
                <div className="space-y-4 animate-page-in">
                  <div>
                    <Label className="text-sm font-semibold">Full Name *</Label>
                    <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" className={`mt-1.5 h-11 ${fieldErrorClass('fullName')}`} />
                    {fieldErrors.fullName && <p className="text-xs text-destructive mt-1">{fieldErrors.fullName}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Date of Birth (optional)</Label>
                    <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} className="mt-1.5 h-11" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Your Region / City *</Label>
                    <Select value={personalRegion} onValueChange={setPersonalRegion}>
                      <SelectTrigger className={`mt-1.5 h-11 ${fieldErrorClass('personalRegion')}`}><SelectValue placeholder="Select your region" /></SelectTrigger>
                      <SelectContent>{GHANA_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                    {fieldErrors.personalRegion && <p className="text-xs text-destructive mt-1">{fieldErrors.personalRegion}</p>}
                  </div>
                  {personalRegion && (
                    <div className="animate-page-in">
                      <Label className="text-sm font-semibold">Your City / Town (optional)</Label>
                      <Input value={personalCity} onChange={e => setPersonalCity(e.target.value)} placeholder="e.g. Accra, Tema" className="mt-1.5 h-11" />
                    </div>
                  )}
                  <div>
                    <Label className="text-sm font-semibold">How will you promote your store? (optional)</Label>
                    <Textarea
                      value={promotionNote}
                      onChange={e => setPromotionNote(e.target.value)}
                      placeholder="e.g. I'll use my WhatsApp status and share with friends..."
                      rows={2}
                      maxLength={200}
                      className="mt-1.5"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{promotionNote.length}/200 characters</p>
                  </div>
                  <div className="pt-2">
                    <Label className="text-sm font-semibold">Have you sold data before? *</Label>
                    <div className="flex gap-3 mt-2">
                      {[
                        { label: 'Yes', value: true },
                        { label: 'No', value: false },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            setSoldBefore(opt.value);
                            if (fieldErrors.soldBefore) {
                              setFieldErrors(prev => { const n = { ...prev }; delete n.soldBefore; return n; });
                            }
                          }}
                          className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all duration-200 btn-press ${
                            soldBefore === opt.value
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                          } ${fieldErrors.soldBefore ? 'border-destructive' : ''}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {fieldErrors.soldBefore && <p className="text-xs text-destructive mt-1">{fieldErrors.soldBefore}</p>}
                  </div>
                </div>
              )}

              {/* ====== STEP 3 — Business Plan & Agreements ====== */}
              {step === 3 && (
                <div className="space-y-4 animate-page-in">
                  <div>
                    <Label className="text-sm font-semibold">How do you plan to sell? * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {SELLING_CHANNELS.map((channel) => (
                        <button
                          key={channel}
                          type="button"
                          onClick={() => toggleSellingChannel(channel)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all duration-200 btn-press ${
                            sellingChannels.includes(channel)
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                          } ${fieldErrors.sellingChannels ? 'border-destructive/50' : ''}`}
                        >
                          {sellingChannels.includes(channel) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                          {channel}
                        </button>
                      ))}
                    </div>
                    {fieldErrors.sellingChannels && <p className="text-xs text-destructive mt-1">{fieldErrors.sellingChannels}</p>}
                    {sellingChannels.includes('Other') && (
                      <div className="mt-2 animate-page-in">
                        <Input
                          value={otherChannelText}
                          onChange={e => setOtherChannelText(e.target.value)}
                          placeholder="Please specify..."
                          className="h-10"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Expected customers per week *</Label>
                    <Select value={expectedCustomers} onValueChange={setExpectedCustomers}>
                      <SelectTrigger className={`mt-1.5 h-11 ${fieldErrorClass('expectedCustomers')}`}><SelectValue placeholder="Select range" /></SelectTrigger>
                      <SelectContent>{CUSTOMER_RANGES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    {fieldErrors.expectedCustomers && <p className="text-xs text-destructive mt-1">{fieldErrors.expectedCustomers}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Primary customer location (optional)</Label>
                    <Input
                      value={customerLocation}
                      onChange={e => setCustomerLocation(e.target.value)}
                      placeholder="e.g. Greater Accra, Kumasi"
                      className="mt-1.5 h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Do you have an existing customer base? (optional)</Label>
                    <div className="flex gap-3 mt-2">
                      {[
                        { label: 'Yes', value: true },
                        { label: 'No', value: false },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setHasCustomerBase(opt.value)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 btn-press ${
                            hasCustomerBase === opt.value
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Agreement section */}
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-bold text-foreground">Agent Agreement *</p>
                    <p className="text-xs text-muted-foreground">You must agree to all terms below.</p>
                    {[
                      { id: 'no-scam', label: 'I agree not to scam customers', checked: agreedNoScam, set: setAgreedNoScam, field: 'agreedNoScam' },
                      { id: 'suspension', label: 'I understand my store can be suspended if fraud is detected', checked: agreedSuspension, set: setAgreedSuspension, field: 'agreedSuspension' },
                      { id: 'wrong-numbers', label: 'I agree to provide correct customer numbers and accept no refunds for wrong numbers', checked: agreedWrongNumbers, set: setAgreedWrongNumbers, field: 'agreedWrongNumbers' },
                      { id: 'accurate-info', label: 'I agree to provide accurate information for verification', checked: agreedAccurateInfo, set: setAgreedAccurateInfo, field: 'agreedAccurateInfo' },
                    ].map((item) => (
                      <div key={item.id} className="flex items-start gap-3">
                        <Checkbox
                          checked={item.checked}
                          onCheckedChange={(v) => {
                            item.set(!!v);
                            if (fieldErrors[item.field]) {
                              setFieldErrors(prev => { const n = { ...prev }; delete n[item.field]; return n; });
                            }
                          }}
                          id={item.id}
                          className={`mt-0.5 ${fieldErrors[item.field] ? 'border-destructive' : ''}`}
                        />
                        <Label htmlFor={item.id} className="cursor-pointer text-sm leading-snug text-foreground">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-5 mt-5 border-t">
              {step > 1 ? (
                <Button variant="outline" onClick={handleBack} className="gap-1 btn-press">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              ) : <div />}
              {step < 3 ? (
                <Button onClick={handleNext} disabled={!isStepValid} className="gap-1 btn-press">
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting || !isStepValid} className="gap-1 btn-press">
                  <Zap className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Login Modal for Guests */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-center">Sign in to submit</DialogTitle>
            <DialogDescription className="text-center text-sm">
              Create an account or sign in to submit your agent application. You are not an agent yet until approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Button onClick={() => handleLoginRedirect('login')} className="w-full gap-2 h-12">
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
            <Button variant="outline" onClick={() => handleLoginRedirect('signup')} className="w-full gap-2 h-12">
              <UserPlus className="w-4 h-4" />
              Create Account
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Your application progress has been saved and will be submitted after you sign in.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default BecomeAgent;
