import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { buddyErrorCode } from '../../api/buddies';
import { fileReport, type ReportReason, type ReportTargetType } from '../../api/chats';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { REPORT_REASONS } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

// Report a message, a Chats note or a camp note (spec §9; the owner-approved Report board): pick a reason (Spam is
// picked to start with), optionally tick "Also block {name}", then Report. The other person is never told. A ticked
// block runs only once the report is filed (onBlock); otherwise the sheet closes. Cancel files nothing. Used by the
// thread, the inbox's notes row and the Campfire's "Who's here". The reason rows and the block row are a radio group
// and a checkbox (not buttons); Cancel and Report are the standard Button (outline / destructive, lg, side by side).

// --color-destructive from global.css (COLORS has no destructive key); the ticked block box.
const DESTRUCTIVE = { light: 'rgb(192, 57, 43)', dark: 'rgb(248, 113, 113)' } as const;

function Radio({ checked, color }: { checked: boolean; color: string }) {
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {checked ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
    </View>
  );
}

function Checkbox({ checked, color, border }: { checked: boolean; color: string; border: string }) {
  return (
    <View
      style={{
        width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: checked ? color : border,
        backgroundColor: checked ? color : 'transparent', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
    </View>
  );
}

export function ReportSheet({ target, name, onClose, onBlock }: {
  target: { type: ReportTargetType; id: string } | null;
  name: string;
  onClose: () => void;
  /** Called after the report is filed, when "Also block" was ticked (instead of onClose). */
  onBlock: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const colors = COLORS[scheme];
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]!.reason);
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const key = target ? `${target.type}:${target.id}` : null;
  // Each new target starts fresh: Spam picked, block unticked, no error.
  useEffect(() => {
    setReason(REPORT_REASONS[0]!.reason);
    setBlock(false);
    setError(null);
  }, [key]);

  const submit = async () => {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fileReport(target.type, target.id, reason);
      if (block) onBlock();
      else onClose();
    } catch (e) {
      setError(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const what = target?.type === 'message' ? 'message' : target?.type === 'camp_note' ? 'camp note' : 'note';
  return (
    // In flight, the sheet stays up: closed mid-report, a ticked block would still run once the report is filed.
    <Sheet visible={target !== null} onClose={onClose} dismissible={!busy} testID="report-sheet">
      <View className="gap-1.5 pb-2">
        <Text className="text-heading">{`Report ${what}`}</Text>
        <Text className="mb-1.5 text-caption text-muted-foreground">{`${name} won't be told. Reports are kept for review.`}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Reason">
          {REPORT_REASONS.map((r) => (
            <Pressable
              key={r.reason}
              testID={`report-${r.reason}`}
              accessibilityRole="radio"
              accessibilityLabel={r.label}
              accessibilityState={{ checked: reason === r.reason, disabled: busy }}
              disabled={busy}
              onPress={() => setReason(r.reason)}
              className="min-h-[48px] flex-row items-center gap-3 px-1"
            >
              <Radio checked={reason === r.reason} color={colors.foreground} />
              <Text className="text-body">{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          testID="report-block"
          accessibilityRole="checkbox"
          accessibilityLabel={`Also block ${name}`}
          accessibilityState={{ checked: block, disabled: busy }}
          disabled={busy}
          onPress={() => setBlock((b) => !b)}
          className="mt-1 min-h-[48px] flex-row items-center gap-3 border-t border-border px-1"
        >
          <Checkbox checked={block} color={DESTRUCTIVE[scheme]} border={colors.muted} />
          <Text className="text-body">{`Also block ${name}`}</Text>
        </Pressable>
        {error ? <Text testID="report-error" className="text-caption text-destructive">{error}</Text> : null}
        <View className="mt-2.5 flex-row gap-2.5">
          <Button testID="report-cancel" variant="outline" size="lg" className="flex-1" disabled={busy} onPress={onClose}>Cancel</Button>
          <Button testID="report-submit" variant="destructive" size="lg" className="flex-1" loading={busy} onPress={() => void submit()}>Report</Button>
        </View>
      </View>
    </Sheet>
  );
}
