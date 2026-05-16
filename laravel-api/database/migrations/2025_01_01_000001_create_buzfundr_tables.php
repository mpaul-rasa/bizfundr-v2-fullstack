<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {

    public function up(): void
    {
        // ═══════════ ISSUERS (Startups) ═══════════
        Schema::create('issuers', function (Blueprint $table) {
            $table->id();
            $table->string('company_name');
            $table->string('wallet_address', 42)->unique();
            $table->string('email')->unique();
            $table->decimal('total_raised_12m', 15, 2)->default(0); // $1.5M cap tracking
            $table->boolean('confirmed_no_other_platforms')->default(false);
            $table->boolean('acknowledged_lying_is_crime')->default(false);
            $table->text('offering_document_path')->nullable(); // Form 45-110F1 PDF
            $table->timestamps();
        });

        // ═══════════ OFFERINGS ═══════════
        Schema::create('offerings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issuer_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('vault_address', 42)->nullable()->unique();
            $table->decimal('min_goal_usdc', 15, 6);
            $table->decimal('max_cap_usdc', 15, 6);
            $table->decimal('max_per_investor_usdc', 15, 6)->default(2500);
            $table->integer('duration_days')->default(90);
            $table->enum('status', ['draft', 'active', 'funded', 'failed', 'cancelled'])->default('draft');
            $table->timestamp('deployed_at')->nullable();
            $table->timestamp('deadline_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->boolean('post_close_notice_sent')->default(false);
            $table->timestamp('post_close_notice_at')->nullable();
            $table->text('offering_document_path')->nullable(); // F1 per offering
            $table->integer('amendment_count')->default(0);
            $table->timestamps();
        });

        // ═══════════ INVESTORS ═══════════
        Schema::create('investors', function (Blueprint $table) {
            $table->id();
            $table->string('wallet_address', 42)->unique();
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->timestamps();
        });

        // ═══════════ INVESTMENTS ═══════════
        Schema::create('investments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('offering_id')->constrained()->cascadeOnDelete();
            $table->foreignId('investor_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount_usdc', 15, 6);
            $table->enum('status', ['pending', 'locked', 'funded', 'refunded', 'emergency_refunded', 'failed'])->default('pending');
            $table->string('tx_hash', 66)->nullable();
            $table->string('refund_tx_hash', 66)->nullable();
            $table->timestamp('subscription_signed_at'); // Start of 48hr window
            $table->timestamp('refund_eligible_until')->nullable();
            $table->timestamps();
        });

        // ═══════════ COMPLIANCE RECORDS (Forms F1, F2, Subscription) ═══════════
        Schema::create('compliance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('investor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('offering_id')->constrained()->cascadeOnDelete();
            $table->boolean('risk_acknowledgement_completed')->default(false); // F2
            $table->timestamp('risk_acknowledged_at')->nullable();
            $table->boolean('offering_document_confirmed')->default(false); // F1
            $table->timestamp('offering_document_confirmed_at')->nullable();
            $table->boolean('subscription_agreement_signed')->default(false);
            $table->timestamp('subscription_signed_at')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->unique(['investor_id', 'offering_id']);
        });

        // ═══════════ AUDIT LOG (8-year retention) ═══════════
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('event_type'); // invest, refund, release, fail, emergency_refund, amendment
            $table->foreignId('offering_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('investor_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor'); // admin, investor:{wallet}, issuer:{wallet}
            $table->string('tx_hash', 66)->nullable();
            $table->json('payload')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('compliance_records');
        Schema::dropIfExists('investments');
        Schema::dropIfExists('investors');
        Schema::dropIfExists('offerings');
        Schema::dropIfExists('issuers');
    }
};
