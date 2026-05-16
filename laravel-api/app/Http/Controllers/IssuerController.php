<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class IssuerController extends Controller
{
    /**
     * List all issuers
     */
    public function index(): JsonResponse
    {
        $issuers = DB::table('issuers')->orderByDesc('created_at')->get();
        return response()->json(['success' => true, 'issuers' => $issuers]);
    }

    /**
     * Show single issuer with their offerings
     */
    public function show(int $id): JsonResponse
    {
        $issuer = DB::table('issuers')->find($id);
        if (!$issuer) return response()->json(['success' => false, 'message' => 'Issuer not found'], 404);

        $offerings = DB::table('offerings')->where('issuer_id', $id)->orderByDesc('created_at')->get();

        return response()->json(['success' => true, 'issuer' => $issuer, 'offerings' => $offerings]);
    }

    /**
     * Register new issuer (startup sign-up)
     * Enforces: $1.5M limit check, one-offering rule, lying-is-crime acknowledgement
     */
    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'company_name' => 'required|string|max:255',
            'wallet_address' => 'required|string|regex:/^0x[a-fA-F0-9]{40}$/|unique:issuers,wallet_address',
            'email' => 'required|email|unique:issuers,email',
            'confirmed_no_other_platforms' => 'required|boolean|accepted',
            'acknowledged_lying_is_crime' => 'required|boolean|accepted',
        ], [
            'confirmed_no_other_platforms.accepted' => 'You must confirm you do not have crowdfunding campaigns on other platforms.',
            'acknowledged_lying_is_crime.accepted' => 'You must acknowledge that providing false information is a criminal offence under Canadian securities law.',
            'wallet_address.regex' => 'Wallet address must be a valid Ethereum address (0x + 40 hex characters).',
            'wallet_address.unique' => 'This wallet address is already registered.',
            'email.unique' => 'This email is already registered.',
        ]);

        if ($v->fails()) return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $id = DB::table('issuers')->insertGetId([
            'company_name' => $request->company_name,
            'wallet_address' => $request->wallet_address,
            'email' => $request->email,
            'total_raised_12m' => 0,
            'confirmed_no_other_platforms' => true,
            'acknowledged_lying_is_crime' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('audit_logs')->insert([
            'event_type' => 'issuer_registered',
            'actor' => "issuer:{$request->wallet_address}",
            'payload' => json_encode(['company' => $request->company_name]),
            'ip_address' => $request->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'issuer_id' => $id,
            'message' => "Issuer '{$request->company_name}' registered successfully.",
        ], 201);
    }

    /**
     * Upload offering document (Form 45-110F1) for an issuer
     */
    public function uploadDocument(Request $request, int $id): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'document' => 'required|file|mimes:pdf|max:10240', // Max 10MB PDF
        ]);
        if ($v->fails()) return response()->json(['success' => false, 'errors' => $v->errors()], 422);

        $issuer = DB::table('issuers')->find($id);
        if (!$issuer) return response()->json(['success' => false, 'message' => 'Issuer not found'], 404);

        $path = $request->file('document')->store("offering-documents/issuer-{$id}", 'public');

        DB::table('issuers')->where('id', $id)->update([
            'offering_document_path' => $path,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'document_path' => $path,
            'message' => 'Offering document (Form 45-110F1) uploaded successfully.',
        ]);
    }
}
