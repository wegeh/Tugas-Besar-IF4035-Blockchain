import { ethers } from "ethers"

// Error name -> User-friendly message (Indonesian)
const ERROR_MESSAGES: Record<string, string> = {
    // SPEGRKToken Custom Errors
    "InvalidRecipient": "Alamat penerima tidak valid.",
    "InvalidAmount": "Jumlah harus lebih dari 0.",
    "TokenAlreadyIssued": "Token untuk proyek dan vintage ini sudah diterbitkan sebelumnya (Anti-Double Counting).",
    "InvalidAttestation": "Attestasi Oracle tidak valid atau belum diproses. Pastikan Oracle service berjalan.",
    "AttestationAlreadyUsed": "Attestasi ini sudah digunakan untuk penerbitan token lain.",
    "MetadataMismatch": "Data metadata tidak cocok dengan yang diattestasi Oracle. Coba refresh dan submit ulang.",
    "AlreadyRetired": "Token ini sudah di-retire sebelumnya.",
    "InsufficientBalance": "Saldo SPE tidak mencukupi untuk retire.",

    // PTBAEFactory Custom Errors
    "InvalidOracleAddress": "Alamat Oracle tidak valid.",
    "InvalidSPEAddress": "Alamat SPE Token tidak valid.",
    "PeriodAlreadyExists": "Periode ini sudah dibuka sebelumnya.",

    // PTBAEAllowanceToken Custom Errors
    "PeriodNotActive": "Periode belum aktif. Tidak dapat melakukan alokasi.",
    "NoRecipients": "Daftar penerima tidak boleh kosong.",
    "ArrayLengthMismatch": "Panjang array SPE IDs dan amounts tidak sama.",
    "SurrenderOnlyInAuditPhase": "Surrender hanya dapat dilakukan pada fase Audit.",
    "VintageTooNew": "Vintage SPE token terlalu baru untuk periode compliance ini.",
    "NoVerifiedEmissionData": "Data emisi terverifikasi belum tersedia dari Oracle.",
    "AlreadySurrendered": "Anda sudah melakukan surrender untuk periode ini.",
    "InsufficientPTBAEBalance": "Saldo PTBAE tidak mencukupi untuk membayar tagihan.",
    "NotActive": "Periode belum dalam status aktif.",
    "AlreadyEnded": "Periode sudah berakhir.",
    "TransferRestricted": "Transfer token hanya diizinkan pada fase aktif.",

    // AccessControl (OpenZeppelin)
    "AccessControlUnauthorizedAccount": "Anda tidak memiliki akses Regulator untuk melakukan tindakan ini.",

    // ERC1155 Errors
    "ERC1155InsufficientBalance": "Saldo token tidak mencukupi.",
    "ERC1155InvalidReceiver": "Alamat penerima tidak dapat menerima token ERC1155.",

    // Generic fallbacks
    "CALL_EXCEPTION": "Transaksi ditolak oleh smart contract.",
    "INSUFFICIENT_FUNDS": "Saldo gas tidak cukup untuk transaksi.",
    "NETWORK_ERROR": "Gagal terhubung ke jaringan blockchain.",
    "UNPREDICTABLE_GAS_LIMIT": "Tidak dapat mengestimasi gas. Transaksi kemungkinan akan gagal.",
}

/**
 * Decode smart contract error to user-friendly message
 */
export function decodeContractError(error: any): string {
    console.log("Decoding Error:", error)

    // Check for custom error name (ethers v6)
    if (error.errorName) {
        const msg = ERROR_MESSAGES[error.errorName]
        if (msg) {
            // Add args info if available
            if (error.errorArgs && error.errorArgs.length > 0) {
                return `${msg}`
            }
            return msg
        }
    }

    // Check for revert reason
    if (error.reason) {
        // Map old string reasons to messages
        const reasonMap: Record<string, string> = {
            "to=0": ERROR_MESSAGES["InvalidRecipient"],
            "amount=0": ERROR_MESSAGES["InvalidAmount"],
            "tokenId already issued": ERROR_MESSAGES["TokenAlreadyIssued"],
            "invalid attestation": ERROR_MESSAGES["InvalidAttestation"],
            "attestation used": ERROR_MESSAGES["AttestationAlreadyUsed"],
            "meta mismatch": ERROR_MESSAGES["MetadataMismatch"],
            "already retired": ERROR_MESSAGES["AlreadyRetired"],
            "insufficient": ERROR_MESSAGES["InsufficientBalance"],
        }

        if (reasonMap[error.reason]) {
            return reasonMap[error.reason]
        }

        return error.reason
    }

    // Check for error code
    if (error.code) {
        const codeMsg = ERROR_MESSAGES[error.code]
        if (codeMsg) return codeMsg
    }

    // Check for shortMessage
    if (error.shortMessage) {
        // Extract useful part
        if (error.shortMessage.includes("execution reverted")) {
            return "Transaksi ditolak. Periksa console untuk detail."
        }
        return error.shortMessage
    }

    // Fallback to message
    if (error.message) {
        // Truncate long messages
        const msg = error.message
        if (msg.length > 100) {
            return msg.substring(0, 100) + "..."
        }
        return msg
    }

    return "Transaksi gagal. Silakan coba lagi."
}

/**
 * Get error details for logging
 */
export function getErrorDetails(error: any): Record<string, any> {
    return {
        errorName: error.errorName,
        errorArgs: error.errorArgs,
        reason: error.reason,
        code: error.code,
        shortMessage: error.shortMessage,
        data: error.data,
    }
}
