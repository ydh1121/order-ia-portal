/** Exact R3 identity/CSP preparation sidecar. Not registration or an execution grant. */
export const R3_DOCUMENT_PROFILES = [
  {
    "artifact_id": "ORDER-DESIGN-QA-0569-R3",
    "version": "R3",
    "source_drive_file_id": "1p1kD2_HUIFN6pQaLx11idsW-ivshm9YA",
    "package_sha256": "48f0ea4047c5f842d6a03fad2e0a7fb0af792176ef0f0b0cc8003bc2855988e9",
    "package_bytes": 5967266,
    "entrypoint": "design-qa/ORDER_DESIGN_QA_MSG0569_R3.html",
    "entrypoint_sha256": "7e00018be24390ecbeb05b62f38903b7d53a6f9e6a319d3e416f8b97da9610e4",
    "entrypoint_bytes": 4285604,
    "standalone_html_drive_id": "1OXd1d0lKoDDn6dQGy9HCnU22bqX4tlB8",
    "baseline_commit": "b7ca48c432cbd1284d15def276aea708a16dc99d",
    "mode": "DESIGN_OBSERVER",
    "script_hashes": [
      "sha256-/0CZphKR4VwmdI1HplYBccuUsop9mvuXKZivHg8aDlM=",
      "sha256-/aou2twIAHiBh1fyiHs7s5LRr2IRZRKjkl4levCxhXg=",
      "sha256-3BoSHyAYXcjv+l4QkjJ2Ve7Uz6s9jeg51vLTMc801WE=",
      "sha256-I/sCZLYBvg9ikoHSi6TCEF3C0VLMrrLItGu4vTwp5K8=",
      "sha256-IU/IBeheJWf0qF5zVJZ7X3YxdBZ92frIm1gkYgI5QZU=",
      "sha256-KiSizYECwdLK4Oko65sqc+WycxLbtJjjqTgtofWwvTk=",
      "sha256-MzEdL2TIoluYHIxsW2/hydDHk5vRCumpa9CgaAqPAyI=",
      "sha256-O9igfEn3He5KhLm0Umd2Gf48JuGSxWJgIhd3VXOs6vQ="
    ],
    "allow_data_modules": true,
    "nested_template_sha256": "53e7d211481b7b8dabdd5565de267d286658f15e05fe5c978213d77839e1e581"
  },
  {
    "artifact_id": "ORDER-COPY-MOTION-0569-R3",
    "version": "R3",
    "source_drive_file_id": "1SDi9yjs7pFGqtcNARYgiJY_2LViG9VVC",
    "package_sha256": "b5d7aaf38c30ead5b00398a1a1b804a24b4c6a8c65d20c1ebc37f39b3c2a33d1",
    "package_bytes": 23507007,
    "entrypoint": "components/ORDER_MSG0569_COPY_MOTION_R3.html",
    "entrypoint_sha256": "fe1c22201a0c5ec80caefb517b60b08833e930f3803f36c5d7945607487d0005",
    "entrypoint_bytes": 1204283,
    "standalone_html_drive_id": "1GLBMYRhV4CQp2dBu72pAq5d1Uza7fDW_",
    "baseline_commit": "b7ca48c432cbd1284d15def276aea708a16dc99d",
    "mode": "DISPLAY_ONLY",
    "script_hashes": [
      "sha256-ICEQIJPr9u3/KlZ1WQeRTXNj6U1ftPSG56ovVeJjQ2w=",
      "sha256-kSito8SXVWBLZfpWDqHlqSUi9lbbHH6RMCsr5u7fc00=",
      "sha256-nLQWVsfd/DNUKCIiHOnVrp/XvYzqMTiopL9LxaP10EU=",
      "sha256-oDr6BdvnMtMwEvmwKOodCNwdiK4zBDnAurDr8QhHhbw="
    ],
    "allow_data_modules": false,
    "nested_template_sha256": null
  }
];
for(const p of R3_DOCUMENT_PROFILES){Object.freeze(p.script_hashes);Object.freeze(p)}
Object.freeze(R3_DOCUMENT_PROFILES);
