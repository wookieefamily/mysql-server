# Exercise GIF prompts — for Nano Banana (Gemini image model)

> **Note:** Nano Banana makes **still images**, not animated GIFs. Generate the poses
> as stills, then stitch them into a GIF (e.g. [ezgif.com](https://ezgif.com) → "GIF maker").
> For most moves, **2 frames** (start + peak) makes a clean loop. "Hold" moves need just 1.
>
> To keep the character identical across all 20, **paste the STYLE BLOCK before every
> prompt**, and feed your first good image back in as a reference for the rest.

## 🎨 STYLE BLOCK (paste before every prompt)

```
Clean modern flat vector illustration of the SAME single friendly gender-neutral
fitness coach character used consistently across a set: medium skin tone, short
dark hair, wearing a teal tank top and dark purple leggings, simple rounded shapes,
bold clean outlines. Full body fully inside the frame with generous margin, centered.
Square 1:1, transparent background, no text, no logos, no shadows on the ground.
Soft modern palette (teal #42d6c3, purple #7c5cff, white). Friendly, encouraging
tone. Correct, safe exercise form. Low-impact — both/at least one foot stays grounded,
absolutely no jumping. Pose:
```

## 📋 The 20 exercises (filename → prompts)

**1. `march.gif` — March in place**
- Frame A: standing tall, marching, LEFT knee lifted to hip height, RIGHT arm swung forward, front view.
- Frame B: mirror — RIGHT knee lifted, LEFT arm forward.

**2. `steptouch.gif` — Step-touch**
- Frame A: stepping to the LEFT, feet wide apart, arms reaching left, front view.
- Frame B: feet together, stepping to the RIGHT, arms reaching right.

**3. `heeldig.gif` — Heel digs**
- Frame A: LEFT heel tapped out in front, toes up, both arms pulled back in a row motion, front view.
- Frame B: RIGHT heel tapped out in front, arms pulled back.

**4. `kneelift.gif` — Knee lifts**
- Frame A: LEFT knee driven up high toward waist, RIGHT hand reaching across toward the knee, front view.
- Frame B: mirror — RIGHT knee up, LEFT hand across.

**5. `grapevine.gif` — Grapevine**
- Frame A: stepping sideways to the right, trailing foot crossing BEHIND the lead foot, arms out for balance, front view.
- Frame B: feet wide and open after the side step.

**6. `lunge.gif` — Reverse lunge**
- Frame A: standing tall, feet hip-width, front view.
- Frame B: RIGHT foot stepped back into a lunge, both knees bent ~90°, torso upright, hands at chest.

**7. `squat.gif` — Bodyweight squat**
- Frame A: standing tall, feet hip-width, arms down, front view.
- Frame B: squatting — hips sat back and down to thigh-parallel, knees tracking over toes, arms extended forward for balance.

**8. `wallpushup.gif` — Wall push-up**
- Frame A: side view, hands on a wall at shoulder height, body in a straight diagonal line, arms fully extended.
- Frame B: same, elbows bent, chest brought close to the wall.

**9. `glutebridge.gif` — Glute bridge**
- Frame A: side view, lying on back on the floor, knees bent, feet flat, hips down.
- Frame B: hips lifted into a straight line from shoulders to knees, glutes squeezed.

**10. `calfraise.gif` — Calf raise**
- Frame A: standing tall, flat feet, front view, arms relaxed.
- Frame B: risen up high onto the balls of both feet, heels lifted, calves engaged.

**11. `birddog.gif` — Bird-dog**
- Frame A: side view, on hands and knees in a tabletop position, back flat.
- Frame B: RIGHT arm extended straight forward and LEFT leg extended straight back, level with the flat back.

**12. `deadbug.gif` — Dead bug**
- Frame A: side view, lying on back, both arms pointing straight up and both knees bent up over hips.
- Frame B: RIGHT arm lowered back overhead and LEFT leg extended out low, low back staying flat to the floor.

**13. `plank.gif` — Forearm plank (hold)**
- Single frame: side view, forearm plank, body in one straight rigid line from head to heels, core braced.

**14. `wallsit.gif` — Wall sit (hold)**
- Single frame: side view, back flat against a wall, knees bent 90°, thighs parallel to the floor like sitting in an invisible chair.

**15. `legraise.gif` — Standing side leg raise**
- Frame A: standing tall, front view, hand lightly on hip.
- Frame B: RIGHT leg lifted out to the side with control, torso upright.

**16. `oblique.gif` — Standing oblique crunch**
- Frame A: standing tall, RIGHT arm raised overhead, front view.
- Frame B: RIGHT knee lifted up to meet the RIGHT elbow crunching down, bending at the waist.

**17. `superman.gif` — Superman**
- Frame A: side view, lying face-down flat on the floor, arms extended forward.
- Frame B: chest, arms, and legs all lifted off the floor in a gentle arc, back extended.

**18. `punches.gif` — Standing punches**
- Frame A: athletic stance, LEFT arm punching straight forward at chest height, RIGHT fist guarding, front view.
- Frame B: mirror — RIGHT arm punching forward, LEFT fist guarding.

**19. `stretch.gif` — Cool-down stretch**
- Frame A: standing, both arms reaching tall overhead, gentle upward stretch, front view.
- Frame B: gentle side bend, reaching one arm up and over to the opposite side.

**20. `rest.gif` — Rest / mobility (hold)**
- Single frame: calm standing figure with a relaxed posture doing slow deep breathing, hands resting gently on the belly, peaceful expression.

## ✅ Dropping them into the app
- Keep them **square + transparent background** so they sit cleanly in the dark popup.
- Reuse a **seed or reference image** so the character stays consistent.
- Combine frames at ~**2 frames, 600–800 ms each, infinite loop** for the simple moves.
- Save the files into `docs/gifs/` using the **exact filenames above**, then bump
  `ASSET_VER` in both `index.html` and `service-worker.js` (and the SW `CACHE` name)
  so the cache refreshes. Hand them to Claude and it can wire them in + bump the version.
