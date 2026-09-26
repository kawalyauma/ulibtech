'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SiteSettings } from '@edushare/shared';
import { Button, Card, Input, Label, Textarea } from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';

export default function SettingsPage() {
  const q = useQuery({
    queryKey: ['settings', 'site'],
    queryFn: () => api.get<SiteSettings>('/settings/site'),
  });
  return q.data ? <SettingsForm initial={q.data} /> : null;
}

function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const save = useMutation({
    mutationFn: () => api.put('/settings/site', s),
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reindex = useMutation({
    mutationFn: () => api.post('/system/reindex'),
    onSuccess: () => toast.success('Search index rebuild queued'),
  });
  const check = useMutation({
    mutationFn: () => api.post('/system/check-files'),
    onSuccess: () => toast.success('Broken file check queued'),
  });
  const changePw = useMutation({
    mutationFn: () => api.post('/auth/password', pw),
    onSuccess: () => {
      toast.success('Password changed. Please sign in again.');
      window.location.href = '/login';
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save settings
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Site</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sn">Site name</Label>
            <Input
              id="sn"
              value={s.siteName}
              onChange={(e) => setS({ ...s, siteName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tl">Tagline</Label>
            <Input
              id="tl"
              value={s.tagline}
              onChange={(e) => setS({ ...s, tagline: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="de">Description</Label>
            <Textarea
              id="de"
              rows={3}
              value={s.description}
              onChange={(e) => setS({ ...s, description: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ce">Contact email</Label>
            <Input
              id="ce"
              type="email"
              value={s.contactEmail ?? ''}
              onChange={(e) => setS({ ...s, contactEmail: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa">WhatsApp number</Label>
            <Input
              id="wa"
              value={s.whatsappNumber ?? ''}
              onChange={(e) => setS({ ...s, whatsappNumber: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fn">Footer note</Label>
            <Input
              id="fn"
              value={s.footerNote ?? ''}
              onChange={(e) => setS({ ...s, footerNote: e.target.value || null })}
            />
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="font-semibold">Maintenance</h2>
            <p className="text-muted-foreground text-sm">These run in the background worker.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => reindex.mutate()}>
                Rebuild search index
              </Button>
              <Button variant="outline" onClick={() => check.mutate()}>
                Check for broken files
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="font-semibold">Change your password</h2>
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              aria-label="Current password"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              aria-label="New password"
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
            <Button
              onClick={() => changePw.mutate()}
              disabled={!pw.currentPassword || pw.newPassword.length < 10}
            >
              Change password
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
