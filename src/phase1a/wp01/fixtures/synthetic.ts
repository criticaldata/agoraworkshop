import { buildSyntheticCampaign, type CampaignManifest } from '../manifests/campaign.js';
import type { ReportNoticeTiming } from '../contracts/study.js';

export function buildSyntheticCampaignPair(): { before_t0: CampaignManifest; after_t0_before_public: CampaignManifest } {
  return {
    before_t0: buildSyntheticCampaign({ report_notice_timing: 'BEFORE_T0' }),
    after_t0_before_public: buildSyntheticCampaign({ report_notice_timing: 'AFTER_T0_BEFORE_PUBLIC' }),
  };
}

export function buildSyntheticCampaignForTiming(report_notice_timing: Exclude<ReportNoticeTiming, 'NONE' | 'UNRESOLVED'>): CampaignManifest {
  return buildSyntheticCampaign({ report_notice_timing });
}
