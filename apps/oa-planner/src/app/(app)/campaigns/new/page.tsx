import { CampaignCreationWizard } from '@/components/campaign/CampaignCreationWizard'

export default function NewCampaignPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Create New Campaign</h1>
          <p className="text-slate-500 mt-1">
            Set up a new enterprise bargaining campaign with the Playing to Win strategic planning framework.
          </p>
        </div>
        <CampaignCreationWizard />
      </div>
    </div>
  )
}
