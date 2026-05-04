import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';
import TgAdminLayout from './TgAdminLayout';

interface Props {
  title: string;
  description: string;
  phase: string;
}

const TgPlaceholder = ({ title, description, phase }: Props) => (
  <TgAdminLayout title={title} description={description}>
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Construction className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold">Coming soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            This page will be built in {phase}.
          </p>
        </div>
      </CardContent>
    </Card>
  </TgAdminLayout>
);

export default TgPlaceholder;
