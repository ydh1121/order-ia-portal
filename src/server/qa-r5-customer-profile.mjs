/** Exact producer R5 source metadata, not an IA planning registration or execution grant.
 * Two official entries share a tuple; only explicit customer role has a prepared document profile.
 * No UX source, font bytes, credentials or mutable scenario config is embedded here.
 */
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value};
const common={
  "artifact_id": "ORDER-COPY-CANDIDATES-0569-R5",
  "version": "R5",
  "family_id": "ORDER-COPY-MOTION",
  "artifact_type": "existing_qa",
  "artifact_subtype": "copy_motion_candidates",
  "producer_artifact_type": "copy_motion_candidates",
  "owner_track": "UIUX_SUCCESSOR",
  "catalogue_owner_track": "MASTER_PLANNING_SUCCESSOR",
  "source_format": "zip",
  "source_drive_file_id": "1g2ssiACctVLIx3twaDSFyPWNsMfOuo0U",
  "source_url": "https://drive.google.com/file/d/1g2ssiACctVLIx3twaDSFyPWNsMfOuo0U/view",
  "package_bytes": 4978524,
  "package_sha256": "e18cdc755d0decc91b7b33c43cefbdb56be3a6df62af9dd6e909230926f32b1a",
  "baseline_commit": "b7ca48c432cbd1284d15def276aea708a16dc99d",
  "preview_allowed": false,
  "selected_version": null,
  "integrated_version": null,
  "latest_verified_browser": null,
  "registered_by_ia": false,
  "registration_status": "PRODUCER_DELIVERED_PENDING_IA_REGISTRATION",
  "review_status": "WORKING_UNVERIFIED",
  "research_status": "CODE_CANDIDATE_NOT_RUNTIME_ACCEPTED",
  "created_at": "2026-11-11",
  "parent_artifact_id": "ORDER-COPY-CANDIDATES-0569-R4",
  "parent_version": "R4",
  "actual_execution_url": null,
  "change_summary": "공식 고객 흐름 문서 우선 지원 후보. QA 도구의 중첩 제어는 별도 미수락.",
  "source_refs": [
    {
      "role": "producer_report",
      "url": "https://drive.google.com/file/d/1FbJsZOCFfLDXkYmO_qxTX-0F6InHb1U8/view"
    },
    {
      "role": "execution_directive",
      "url": "https://drive.google.com/file/d/1kHJUrBKJ1VB83gUgJR3EabLGMKLALTO6/view"
    }
  ]
};
export const R5_CUSTOMER_PROFILE=freeze({...common,...{
  "entry_role": "customer",
  "entrypoint": "components/ORDER_MSG0569_CUSTOMER_FLOW_R5_WORKING_UNVERIFIED.html",
  "entrypoint_bytes": 1236703,
  "entrypoint_sha256": "6503d5862505141f15079444bfca279e243bd0ca612db4bfca6ddbdf39a21c82",
  "standalone_html_drive_id": "1AVV48JO3bdPzPrTZ7l7_1C6SwrC3o6b2"
},mode:'DISPLAY_ONLY',allow_data_modules:false,
 script_hashes:[
  "sha256-YCra3BMN1r2D9jxSDOAYQaLsP+i1IOdGjPRHdv+c/mE=",
  "sha256-oQsTqdORhT3oEHuAARV8gujy4SoRJsKluehAT/fOV0I=",
  "sha256-zvGnk8oUovd49lhHNId/boEEshpz2MPU2MpXEtJIoHs=",
  "sha256-QXqcJ+MgFtaXDZ5SGIVJP8HA3K29CUE4KjXTu1Wvkdk=",
  "sha256-MD2J4Sk5C9J6HfcfjorgQ5STzeujO+4MGowZqQ1aDOo="
],style_hashes:[
  "sha256-d+nwmrqcF/u5GOIJzStkIj1jCnXLPJbLyGMGebIXgcQ="
],font_inventory:[
  {
    "path": "assets/fonts/IBMPlexSansKR-Regular.woff2",
    "source": "preserved R4 licensed local font",
    "bytes": 438540,
    "sha256": "055a35664c3c3965161c92292504c5633ba9604ec904edc1ed799bf2a436276d"
  },
  {
    "path": "assets/fonts/IBMPlexSansKR-SemiBold.woff2",
    "source": "preserved R4 licensed local font",
    "bytes": 434484,
    "sha256": "5ad7db28ba74d59fe14c260205c62ddb701320f4f098d8a45ef2757bebc29666"
  }
]});
export const R5_QA_ENTRY=freeze({
  "entry_role": "qa",
  "entrypoint": "components/ORDER_MSG0569_COPY_MOTION_R5_WORKING_UNVERIFIED.html",
  "entrypoint_bytes": 1266742,
  "entrypoint_sha256": "d9173cb0e0f7d250d4c5c9d63abda6d7032ee9fec22a0d3526d5a5555371aff4",
  "standalone_html_drive_id": "1mPk0emI8rtPkYSLJCI8h33jBEg1DJedl"
});
// Preserve the producer's primary QA entry; do not silently relabel it as the customer document.
export const R5_RECEIVED_CANDIDATE=freeze({...common,...R5_QA_ENTRY,
 customer_document:{...R5_CUSTOMER_PROFILE},
 entry_roles:[{...{
  "entry_role": "customer",
  "entrypoint": "components/ORDER_MSG0569_CUSTOMER_FLOW_R5_WORKING_UNVERIFIED.html",
  "entrypoint_bytes": 1236703,
  "entrypoint_sha256": "6503d5862505141f15079444bfca279e243bd0ca612db4bfca6ddbdf39a21c82",
  "standalone_html_drive_id": "1AVV48JO3bdPzPrTZ7l7_1C6SwrC3o6b2"
},support:'PREPARED_NOT_ACTIVATED',native:'NOT_RUN'},
 {...R5_QA_ENTRY,support:'QA_TOOL_CONTROL_NOT_SUPPORTED_UNDER_OPAQUE_ISOLATION',native:'NOT_RUN'}],
 qa_tool_support:{direct_child_api:'UNSUPPORTED_UNDER_OPAQUE_ISOLATION',dirty_unknown:'SOURCE_IMPROVED_NOT_NATIVE_VERIFIED',local_confirmation:'SOURCE_IMPROVED_NOT_NATIVE_VERIFIED',complete_note_text:'SOURCE_IMPROVED_NOT_NATIVE_VERIFIED',static_code_inert_config:'SOURCE_IMPROVED_NOT_NATIVE_VERIFIED',native:'NOT_RUN'},
 validation_note:'원본 무결성·고정 정책 준비만 확인. 제작자 모델/DOM 및 IA Node 검사는 native·시각·사용자 수락이 아닙니다.'
});
