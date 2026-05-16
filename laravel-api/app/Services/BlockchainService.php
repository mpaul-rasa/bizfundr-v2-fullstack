<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Exceptions\BlockchainException;

class BlockchainService
{
    private string $baseUrl;
    private string $apiKey;

    public function __construct()
    {
        $this->baseUrl = config('services.blockchain.url', 'http://localhost:3001');
        $this->apiKey = config('services.blockchain.api_key', 'buzfundr-node-api-key-2025');
    }

    // ═══════════ GENERIC REQUEST ═══════════

    private function request(string $method, string $endpoint, array $data = []): array
    {
        try {
            $response = Http::timeout(30)
                ->withHeaders(['X-API-Key' => $this->apiKey, 'Content-Type' => 'application/json'])
                ->{$method}("{$this->baseUrl}{$endpoint}", $data);

            $body = $response->json();

            if (!$response->successful() || ($body['success'] ?? false) === false) {
                throw new BlockchainException(
                    $body['message'] ?? 'Blockchain API error',
                    $body['error_code'] ?? 'BLOCKCHAIN_ERROR',
                    $body['hint'] ?? null,
                    $response->status()
                );
            }

            return $body;
        } catch (BlockchainException $e) {
            throw $e;
        } catch (\Exception $e) {
            Log::error('Blockchain API connection failed', ['endpoint' => $endpoint, 'error' => $e->getMessage()]);
            throw new BlockchainException(
                'Cannot connect to blockchain service. Is the Node.js API running?',
                'CONNECTION_FAILED',
                'Start the Node.js API: cd blockchain && npm start',
                503
            );
        }
    }

    // ═══════════ VAULT OPERATIONS ═══════════

    public function deployVault(array $params): array
    {
        return $this->request('post', '/deploy-vault', $params);
    }

    public function invest(array $params): array
    {
        return $this->request('post', '/invest', $params);
    }

    public function refund(string $vaultAddress, string $investorWallet): array
    {
        return $this->request('post', '/refund', [
            'vault_address' => $vaultAddress,
            'investor_wallet' => $investorWallet,
        ]);
    }

    public function release(string $vaultAddress, string $issuerWallet): array
    {
        return $this->request('post', '/release', [
            'vault_address' => $vaultAddress,
            'issuer_wallet' => $issuerWallet,
        ]);
    }

    public function failOffering(string $vaultAddress): array
    {
        return $this->request('post', '/fail-offering', [
            'vault_address' => $vaultAddress,
        ]);
    }

    public function emergencyRefund(string $vaultAddress, string $investorWallet, string $reason): array
    {
        return $this->request('post', '/emergency-refund', [
            'vault_address' => $vaultAddress,
            'investor_wallet' => $investorWallet,
            'reason' => $reason,
        ]);
    }

    public function amendOffering(string $vaultAddress): array
    {
        return $this->request('post', '/amend-offering', [
            'vault_address' => $vaultAddress,
        ]);
    }

    // ═══════════ READ ═══════════

    public function getVaultStatus(string $vaultAddress): array
    {
        return $this->request('get', "/vault/{$vaultAddress}");
    }

    public function getInvestorInfo(string $vaultAddress, string $wallet): array
    {
        return $this->request('get', "/vault/{$vaultAddress}/investor/{$wallet}");
    }

    public function getHistory(string $vaultAddress): array
    {
        return $this->request('get', "/vault/{$vaultAddress}/history");
    }

    public function getWalletBalance(string $address): array
    {
        return $this->request('get', "/wallet/{$address}");
    }

    public function listVaults(): array
    {
        return $this->request('get', '/vaults');
    }

    // ═══════════ TESTING ═══════════

    public function rechargeWallet(string $wallet, float $amount): array
    {
        return $this->request('post', '/recharge', [
            'wallet_address' => $wallet,
            'amount_usdc' => $amount,
        ]);
    }

    public function advanceTime(int $seconds): array
    {
        return $this->request('post', '/time/advance', ['seconds' => $seconds]);
    }
}
