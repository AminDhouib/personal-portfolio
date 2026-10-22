# T-6401 tower-stacker CPU-bound test timeout, CI evidence only

Not a behavioral proof. The CI run for 4cd0e99e itself (39797926573) was cancelled by a later push. ci-run-e35653a0.png is the green main run 39800250638 for e35653a0, which contains 4cd0e99e (git merge-base --is-ancestor 4cd0e99e e35653a0: yes); all six jobs success.
