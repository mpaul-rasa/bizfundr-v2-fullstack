<?php

namespace App\Http\Controllers;

use App\Services\BlockchainService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class OfferingController extends Controller
{
    public function __construct(private BlockchainService $blockchain)
    {
    }

    // ═══════════ CREATE OFFERING + DEPLOY VAULT ═══════════

    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'issuer_id' => 'required|integer',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'min_goal_usdc' => 'required|numeric|min:1',
            'max_cap_usdc' => 'required|numeric|gte:min_goal_usdc',
            'issuer_wallet' => 'required|string|regex:/^0x[a-fA-F0-9]{40}$/',
            'duration_days' => 'nullable|integer|min:1|max:90',
        ]);
        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        // Check issuer $1.5M 12-month limit
        $issuer = DB::table('issuers')->find($request->issuer_id);
        if (!$issuer)
            return response()->json(['success' => false, 'message' => 'Issuer not found'], 404);
        if ($issuer->total_raised_12m + $request->max_cap_usdc > 1500000) {
            return response()->json([
                'success' => false,
                'error_code' => 'ISSUER_LIMIT_EXCEEDED',
                'message' => "Issuer would exceed $1,500,000 CAD 12-month limit. Current: \${$issuer->total_raised_12m}",
            ], 400);
        }

        // Check one offering at a time
        $activeCount = DB::table('offerings')->where('issuer_id', $request->issuer_id)->where('status', 'active')->count();
        if ($activeCount > 0) {
            return response()->json([
                'success' => false,
                'error_code' => 'ONE_OFFERING_LIMIT',
                'message' => 'Issuer already has an active offering. Only one offering allowed at a time.',
            ], 400);
        }

        $durationDays = $request->duration_days ?? 90;

        // Deploy vault on blockchain
        $result = $this->blockchain->deployVault([
            'min_goal_usdc' => $request->min_goal_usdc,
            'max_cap_usdc' => $request->max_cap_usdc,
            'max_per_investor' => 2500,
            'duration_seconds' => $durationDays * 86400,
            'refund_window_seconds' => 172800, // 48 hours
            'issuer_wallet' => $request->issuer_wallet,
        ]);

        // $offeringId = DB::table('offerings')->insertGetId([
        //     'issuer_id' => $request->issuer_id, 'title' => $request->title,
        //     'description' => $request->description, 'vault_address' => $result['vault_address'],
        //     'min_goal_usdc' => $request->min_goal_usdc, 'max_cap_usdc' => $request->max_cap_usdc,
        //     'max_per_investor_usdc' => 2500, 'duration_days' => $durationDays,
        //     'status' => 'active', 'deployed_at' => now(), 'deadline_at' => now()->addDays($durationDays),
        //     'created_at' => now(), 'updated_at' => now(),
        // ]);
        $durationDays = (int) ($request->duration_days ?? 90);

        $offeringId = DB::table('offerings')->insertGetId([
            'issuer_id' => $request->issuer_id,
            'title' => $request->title,
            'description' => $request->description,
            'vault_address' => $result['vault_address'],
            'min_goal_usdc' => $request->min_goal_usdc,
            'max_cap_usdc' => $request->max_cap_usdc,
            'max_per_investor_usdc' => 2500,
            'duration_days' => $durationDays,
            'status' => 'active',
            'deployed_at' => now(),
            'deadline_at' => now()->addDays((int) $durationDays),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->auditLog('offering_created', $offeringId, null, 'admin', null, $request);

        return response()->json([
            'success' => true,
            'offering_id' => $offeringId,
            'vault_address' => $result['vault_address'],
            'message' => "Offering created. Vault deployed at {$result['vault_address']}",
        ], 201);
    }

    // ═══════════ INVEST ═══════════

    public function invest(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'offering_id' => 'required|integer',
            'investor_wallet' => 'required|string|regex:/^0x[a-fA-F0-9]{40}$/',
            'amount_usdc' => 'required|numeric|min:1|max:2500',
            'risk_acknowledgement_completed' => 'required|boolean|accepted',
            'offering_document_confirmed' => 'required|boolean|accepted',
            'subscription_agreement_signed' => 'required|boolean|accepted',
            'subscription_timestamp' => 'required|date',
        ]);

        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $offering = DB::table('offerings')->find($request->offering_id);
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Offering not found'], 404);
        if ($offering->status !== 'active')
            return response()->json(['success' => false, 'message' => 'Offering is not active'], 400);

        // Get or create investor
        $investor = DB::table('investors')->where('wallet_address', $request->investor_wallet)->first();
        if (!$investor) {
            $investorId = DB::table('investors')->insertGetId([
                'wallet_address' => $request->investor_wallet,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $investorId = $investor->id;
        }

        // Check $2,500 per-investor cap across this offering
        $existingAmount = DB::table('investments')
            ->where('offering_id', $request->offering_id)
            ->where('investor_id', $investorId)
            ->whereIn('status', ['locked', 'funded'])
            ->sum('amount_usdc');
        if ($existingAmount + $request->amount_usdc > 2500) {
            return response()->json([
                'success' => false,
                'error_code' => 'INVESTOR_CAP_EXCEEDED',
                'message' => "Would exceed \$2,500 cap. Current: \${$existingAmount}, Requested: \${$request->amount_usdc}",
            ], 400);
        }

        $subscriptionTime = \Carbon\Carbon::parse($request->subscription_timestamp)->format('Y-m-d H:i:s');


        // Save compliance record
        // DB::table('compliance_records')->updateOrInsert(
        //     ['investor_id' => $investorId, 'offering_id' => $request->offering_id],
        //     [
        //         'risk_acknowledgement_completed' => true,
        //         'risk_acknowledged_at' => now(),
        //         'offering_document_confirmed' => true,
        //         'offering_document_confirmed_at' => now(),
        //         'subscription_agreement_signed' => true,
        //         // 'subscription_signed_at' => $request->subscription_timestamp,
        //         'subscription_signed_at' => \Carbon\Carbon::parse($request->subscription_timestamp)->format('Y-m-d H:i:s'),
        //         'ip_address' => $request->ip(),
        //         'user_agent' => $request->userAgent(),
        //         'updated_at' => now(),
        //     ]
        // );


        DB::table('compliance_records')->updateOrInsert(
            ['investor_id' => $investorId, 'offering_id' => $request->offering_id],
            [
                'risk_acknowledgement_completed' => true,
                'risk_acknowledged_at' => now(),
                'offering_document_confirmed' => true,
                'offering_document_confirmed_at' => now(),
                'subscription_agreement_signed' => true,
                'subscription_signed_at' => $subscriptionTime,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'updated_at' => now(),
            ]
        );

        // Call blockchain
        $result = $this->blockchain->invest([
            'vault_address' => $offering->vault_address,
            'investor_wallet' => $request->investor_wallet,
            'amount_usdc' => $request->amount_usdc,
            'risk_acknowledgement_completed' => true,
            'offering_document_confirmed' => true,
            'subscription_agreement_signed' => true,
            'subscription_timestamp' => $request->subscription_timestamp,
        ]);

        // Save investment record
        // $investmentId = DB::table('investments')->insertGetId([
        //     'offering_id' => $request->offering_id,
        //     'investor_id' => $investorId,
        //     'amount_usdc' => $request->amount_usdc,
        //     'status' => 'locked',
        //     'tx_hash' => $result['tx_hash'],
        //     // 'subscription_signed_at' => $request->subscription_timestamp,
        //     'subscription_signed_at' => \Carbon\Carbon::parse($request->subscription_timestamp),
        //     'refund_eligible_until' => now()->addHours(48),
        //     'created_at' => now(),
        //     'updated_at' => now(),
        // ]);

        $investmentId = DB::table('investments')->insertGetId([
            'offering_id' => $request->offering_id,
            'investor_id' => $investorId,
            'amount_usdc' => $request->amount_usdc,
            'status' => 'locked',
            'tx_hash' => $result['tx_hash'],
            'subscription_signed_at' => $subscriptionTime,
            'refund_eligible_until' => now()->addHours(48),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->auditLog('invest', $request->offering_id, $investorId, "investor:{$request->investor_wallet}", $result['tx_hash'], $request);

        return response()->json([
            'success' => true,
            'investment_id' => $investmentId,
            'tx_hash' => $result['tx_hash'],
            'amount_usdc' => $request->amount_usdc,
            'refund_eligible_until' => now()->addHours(48)->toISOString(),
            'message' => "Invested {$request->amount_usdc} USDC. Refund eligible for 48 hours.",
        ]);
    }

    // ═══════════ REFUND ═══════════

    public function refund(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'offering_id' => 'required|integer',
            'investor_wallet' => 'required|string|regex:/^0x[a-fA-F0-9]{40}$/',
        ]);
        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $offering = DB::table('offerings')->find($request->offering_id);
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Offering not found'], 404);

        $result = $this->blockchain->refund($offering->vault_address, $request->investor_wallet);

        DB::table('investments')
            ->where('offering_id', $request->offering_id)
            ->whereHas('investor', fn($q) => $q->where('wallet_address', $request->investor_wallet))
            ->where('status', 'locked')
            ->update(['status' => 'refunded', 'refund_tx_hash' => $result['tx_hash'], 'updated_at' => now()]);

        $investor = DB::table('investors')->where('wallet_address', $request->investor_wallet)->first();
        $this->auditLog('refund', $request->offering_id, $investor?->id, "investor:{$request->investor_wallet}", $result['tx_hash'], $request);

        return response()->json(['success' => true, ...$result, 'message' => "Refunded {$result['amount_refunded_usdc']} USDC"]);
    }

    // ═══════════ RELEASE (issuer) ═══════════

    public function release(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'offering_id' => 'required|integer',
            'issuer_wallet' => 'required|string|regex:/^0x[a-fA-F0-9]{40}$/',
        ]);
        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $offering = DB::table('offerings')->find($request->offering_id);
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Offering not found'], 404);

        $result = $this->blockchain->release($offering->vault_address, $request->issuer_wallet);

        DB::table('offerings')->where('id', $request->offering_id)->update(['status' => 'funded', 'closed_at' => now(), 'updated_at' => now()]);
        DB::table('investments')->where('offering_id', $request->offering_id)->where('status', 'locked')->update(['status' => 'funded', 'updated_at' => now()]);

        $this->auditLog('release', $request->offering_id, null, "issuer:{$request->issuer_wallet}", $result['tx_hash'], $request);

        return response()->json(['success' => true, ...$result, 'message' => "Released {$result['amount_released_usdc']} USDC to issuer. Offering FUNDED."]);
    }

    // ═══════════ FAIL (admin) ═══════════

    public function fail(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), ['offering_id' => 'required|integer']);
        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $offering = DB::table('offerings')->find($request->offering_id);
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Offering not found'], 404);

        $result = $this->blockchain->failOffering($offering->vault_address);

        DB::table('offerings')->where('id', $request->offering_id)->update(['status' => 'failed', 'closed_at' => now(), 'updated_at' => now()]);
        DB::table('investments')->where('offering_id', $request->offering_id)->where('status', 'locked')->update(['status' => 'failed', 'updated_at' => now()]);

        $this->auditLog('fail', $request->offering_id, null, 'admin', $result['tx_hash'], $request);

        return response()->json(['success' => true, ...$result, 'message' => "Offering failed. {$result['investors_refunded']} investors refunded."]);
    }

    // ═══════════ EMERGENCY REFUND (admin) ═══════════

    public function emergencyRefund(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'offering_id' => 'required|integer',
            'investor_wallet' => 'required|string|regex:/^0x[a-fA-F0-9]{40}$/',
            'reason' => 'required|string|min:10',
        ]);
        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $offering = DB::table('offerings')->find($request->offering_id);
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Offering not found'], 404);

        $result = $this->blockchain->emergencyRefund($offering->vault_address, $request->investor_wallet, $request->reason);

        $investor = DB::table('investors')->where('wallet_address', $request->investor_wallet)->first();
        if ($investor) {
            DB::table('investments')->where('offering_id', $request->offering_id)->where('investor_id', $investor->id)
                ->where('status', 'locked')->update(['status' => 'emergency_refunded', 'refund_tx_hash' => $result['tx_hash'], 'updated_at' => now()]);
        }

        $this->auditLog('emergency_refund', $request->offering_id, $investor?->id, 'admin', $result['tx_hash'], $request, ['reason' => $request->reason]);

        return response()->json(['success' => true, ...$result, 'message' => "Emergency refund: {$result['amount_refunded_usdc']} USDC returned"]);
    }

    // ═══════════ AMEND OFFERING ═══════════

    public function amend(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), ['offering_id' => 'required|integer']);
        if ($v->fails())
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $offering = DB::table('offerings')->find($request->offering_id);
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Offering not found'], 404);

        $result = $this->blockchain->amendOffering($offering->vault_address);
        DB::table('offerings')->where('id', $request->offering_id)->increment('amendment_count');

        $this->auditLog('amendment', $request->offering_id, null, 'admin', $result['tx_hash'] ?? null, $request);

        return response()->json(['success' => true, ...$result, 'message' => 'All investor refund windows reset to 48 hours.']);
    }

    // ═══════════ READ ENDPOINTS ═══════════

    public function index(): JsonResponse
    {
        $offerings = DB::table('offerings')
            ->join('issuers', 'offerings.issuer_id', '=', 'issuers.id')
            ->select('offerings.*', 'issuers.company_name', 'issuers.wallet_address as issuer_wallet')
            ->orderByDesc('offerings.created_at')->get();

        return response()->json(['success' => true, 'offerings' => $offerings]);
    }

    public function show(int $id): JsonResponse
    {
        $offering = DB::table('offerings')
            ->join('issuers', 'offerings.issuer_id', '=', 'issuers.id')
            ->select('offerings.*', 'issuers.company_name', 'issuers.wallet_address as issuer_wallet')
            ->where('offerings.id', $id)->first();
        if (!$offering)
            return response()->json(['success' => false, 'message' => 'Not found'], 404);

        $investments = DB::table('investments')
            ->join('investors', 'investments.investor_id', '=', 'investors.id')
            ->select('investments.*', 'investors.wallet_address')
            ->where('investments.offering_id', $id)->get();

        $vault = null;
        if ($offering->vault_address) {
            try {
                $vault = $this->blockchain->getVaultStatus($offering->vault_address);
            } catch (\Exception $e) {
            }
        }

        return response()->json(['success' => true, 'offering' => $offering, 'investments' => $investments, 'vault' => $vault]);
    }

    public function vaultStatus(int $id): JsonResponse
    {
        $offering = DB::table('offerings')->find($id);
        if (!$offering || !$offering->vault_address)
            return response()->json(['success' => false, 'message' => 'Vault not found'], 404);
        return response()->json($this->blockchain->getVaultStatus($offering->vault_address));
    }

    public function history(int $id): JsonResponse
    {
        $offering = DB::table('offerings')->find($id);
        if (!$offering || !$offering->vault_address)
            return response()->json(['success' => false, 'message' => 'Vault not found'], 404);
        return response()->json($this->blockchain->getHistory($offering->vault_address));
    }

    // ═══════════ TESTING HELPERS ═══════════

    public function recharge(Request $request): JsonResponse
    {
        return response()->json($this->blockchain->rechargeWallet($request->wallet_address, $request->amount_usdc));
    }

    public function advanceTime(Request $request): JsonResponse
    {
        return response()->json($this->blockchain->advanceTime((int) $request->seconds));
    }

    // ═══════════ AUDIT LOG ═══════════

    private function auditLog(string $event, ?int $offeringId, ?int $investorId, string $actor, ?string $txHash, Request $request, array $extra = []): void
    {
        DB::table('audit_logs')->insert([
            'event_type' => $event,
            'offering_id' => $offeringId,
            'investor_id' => $investorId,
            'actor' => $actor,
            'tx_hash' => $txHash,
            'payload' => json_encode($extra),
            'ip_address' => $request->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
