function Assert-CuBudget {
 foreach($deadline in @($env:ZEDUI_CU_DEADLINE,$env:ZEDUI_CU_PHASE_DEADLINE,$env:ZEDUI_CU_EXPLICIT_GO_UNTIL)){
  if($deadline-and[DateTime]::UtcNow.Ticks-ge[long]$deadline){throw 'Native run deadline expired; no further interaction'}
 }
}

function Write-CuEvidence([string]$Stage,[hashtable]$Details=@{}) {
 if(-not$env:ZEDUI_CU_EVIDENCE_DIR){return}
 $directory=[IO.Path]::GetFullPath($env:ZEDUI_CU_EVIDENCE_DIR)
 if(-not(Test-Path -LiteralPath $directory -PathType Container)){throw 'Native evidence directory missing'}
 $record=[ordered]@{utc=[DateTime]::UtcNow.ToString('o');phase=$env:ZEDUI_CU_PHASE;stage=$Stage;details=$Details}
 $line=($record|ConvertTo-Json -Depth 8 -Compress)+[Environment]::NewLine
 [IO.File]::AppendAllText((Join-Path $directory 'steps.jsonl'),$line,(New-Object Text.UTF8Encoding($false)))
}
