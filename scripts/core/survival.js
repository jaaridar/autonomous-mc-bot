// One module now: core/survival-scenarios.js + core/survival-capabilities.js + core/food-strategy.js + core/adaptive-planning.js (see docs/ARCHITECTURE.md).


// ---------------------------------------------------------------- survival-scenarios.js

/**
 * Survival Scenarios - exhaustive handling for 80 bedrock.dev stress tests.
 * Pure logic, no engine deps. Covers:
 * A. Falls 1-15, B. First night mobs 16-30, C. Resource shortages 31-45,
 * D. Shelter/navigation failures 46-60, E. Multi-problem 61-80
 * Each scenario has detection, priority, and action plan.
 */


// ===== FALL SCENARIOS 1-15 =====
export const FALL_SCENARIOS = {
    1: { name: "ravine_flee_zombie", triggers: ["low_hp","unknown_depth","zombie"], priority: 95, actions: ["assess_depth","check_health","find_climb_route","block_zombie","heal_if_safe"], hazards: ["fall","zombie"] },
    2: { name: "mountain_ledge_sunset", triggers: ["fall_damage","sunset","darkness","hostile_spawn"], priority: 90, actions: ["assess_fall_damage","check_darkness_timer","find_shelter_nearby","light_if_have","retreat_from_edge"], hazards: ["fall","darkness","spawn"] },
    3: { name: "cave_while_tree_cut", triggers: ["unexpected_descent","no_torches","limited_equipment"], priority: 85, actions: ["assess_cave_depth","check_torch","place_torch_if_have","find_exit_up","preserve_logs"], hazards: ["darkness","unknown_terrain"] },
    4: { name: "water_above_underwater_cave", triggers: ["oxygen","underwater_cave","unfamiliar_terrain","safe_ascent"], priority: 90, actions: ["check_oxygen","find_air_pocket","ascend_safe","avoid_drowning","scan_cave_entrance"], hazards: ["drowning","disorientation"] },
    5: { name: "lava_pool_while_mining", triggers: ["lava","limited_blocks","no_fire_resist"], priority: 100, actions: ["immediate_retreat_from_lava","check_blocks","place_block_barrier","find_safe_route","remember_lava_for_portal"], hazards: ["lava","fire"] },
    6: { name: "ravine_skeleton_above", triggers: ["ranged_damage","skeleton","cover","climb_out"], priority: 95, actions: ["find_cover_from_above","block_LOS","climb_out_perpendicular","shield_if_have","zigzag"], hazards: ["skeleton","fall"] },
    7: { name: "hole_creeper_chase", triggers: ["confined_space","creeper","explosion_risk","blocked_exit"], priority: 100, actions: ["assess_explosion_radius","find_alternate_exit","retreat_from_creeper","avoid_corner","place_block_if_needed"], hazards: ["creeper","explosion"] },
    8: { name: "cave_broken_pickaxe", triggers: ["broken_pickaxe","mining_escape_unavailable","limited_resources"], priority: 85, actions: ["check_pickaxe_durability","find_alternate_exit_no_mine","use_hands_if_soil","preserve_remaining_tool","craft_new_if_possible"], hazards: ["tool_break","trapped"] },
    9: { name: "narrow_ledge_above_lava", triggers: ["balance","lava_below","safe_movement","block_placement"], priority: 100, actions: ["sneak_immediately","assess_ledge_stability","place_blocks_to_widen","retreat_to_safe","avoid_jumping"], hazards: ["lava","fall"] },
    10: { name: "deep_cave_after_sunset", triggers: ["no_light","unfamiliar_route","hostile_spawns"], priority: 90, actions: ["place_torch_immediately","find_known_route","avoid_dark_areas","listen_for_mobs","retreat_if_overwhelmed"], hazards: ["darkness","hostile"] },
    11: { name: "water_drowned_chase", triggers: ["underwater_combat","drowned","oxygen","surface_exit"], priority: 95, actions: ["check_oxygen","surface_for_air","combat_drowned_if_needed","find_shore","boat_if_have"], hazards: ["drowned","drowning"] },
    12: { name: "tree_spider_encounter", triggers: ["fall_damage","spider","immediate_melee","weapon_readiness"], priority: 85, actions: ["check_fall_damage","equip_weapon_immediately","kite_spider","find_open_ground","heal_if_needed"], hazards: ["spider","fall"] },
    13: { name: "ravine_lose_surface", triggers: ["orientation","vertical_navigation","resource_conservation"], priority: 80, actions: ["mark_current_pos","find_upward_route","conserve_blocks","use_torches_as_markers","climb_systematically"], hazards: ["disorientation","resource_drain"] },
    14: { name: "cave_empty_hunger", triggers: ["empty_hunger","limited_regen","difficult_climb","food_shortage"], priority: 90, actions: ["check_food","avoid_sprinting","find_easy_exit","conserve_hunger","eat_if_have"], hazards: ["hunger","exhaustion"] },
    15: { name: "hole_too_deep_jump", triggers: ["too_deep_to_jump","block_placement","safe_pillar","alternative_exit"], priority: 85, actions: ["assess_depth","check_blocks","pillar_up_safely","find_alternative_exit","avoid_falling_blocks"], hazards: ["trapped","fall"] },
};

// ===== NIGHT COMBAT 16-30 =====
export const NIGHT_COMBAT = {
    16: { name: "sunset_3_skeletons_1_zombie", triggers: ["sunset","no_shelter","3_skeletons","zombie"], priority: 100, actions: ["break_LOS","separate_enemies","retreat_to_cover","prioritize_skeletons","avoid_open"], hazards: ["ranged_swarm","sunset"] },
    17: { name: "4_zombies_building_shelter", triggers: ["interrupted_construction","4_zombies","escape_route","defensive_position"], priority: 90, actions: ["abort_build_if_needed","find_defensive_position","keep_escape_route","fight_one_by_one","resume_build_if_safe"], hazards: ["zombie_swarm","construction"] },
    18: { name: "creeper_2_skeletons_block_home", triggers: ["creeper","2_skeletons","explosion_distance","ranged_cover","alternate_route"], priority: 95, actions: ["assess_explosion_radius","find_cover_from_skeletons","alternate_route_home","kill_creeper_first_if_safe","avoid_corner"], hazards: ["creeper","skeleton"] },
    19: { name: "spider_roof_skeleton_outside", triggers: ["spider_climb","shelter_roof","skeleton_outside","multiple_angles","shelter_integrity"], priority: 90, actions: ["check_roof_integrity","handle_spider_first","block_skeleton_LOS","reinforce_entrance","stay_inside_if_safe"], hazards: ["spider","skeleton","shelter_breach"] },
    20: { name: "2_creepers_narrow_entrance", triggers: ["2_creepers","narrow_entrance","simultaneous_explosion","trapped_inside"], priority: 100, actions: ["prevent_simultaneous","lure_one_away","avoid_trapping_inside","keep_exit_open","retreat_if_needed"], hazards: ["creeper_swarm","trapped"] },
    21: { name: "zombie_blocks_exit_skeleton_above", triggers: ["zombie_blocks_exit","skeleton_above","cover","alternate_exit","combat_prioritization"], priority: 95, actions: ["find_alternate_exit","cover_from_skeleton","kill_zombie_first","use_shield","escape_if_possible"], hazards: ["zombie","skeleton"] },
    22: { name: "witch_low_health", triggers: ["witch","low_health","potion_threat","retreat","healing"], priority: 95, actions: ["immediate_retreat","avoid_potion","heal_if_safe","use_cover","flee_far"], hazards: ["witch","poison"] },
    23: { name: "mob_enters_small_shelter", triggers: ["mob_enters","small_shelter","open_entrance","doorway_control","escape_feasibility","close_combat"], priority: 90, actions: ["control_doorway","assess_escape_feasibility","close_combat_if_trapped","block_entrance","pillar_if_needed"], hazards: ["shelter_breach","melee"] },
    24: { name: "zombie_then_skeleton_joins", triggers: ["zombie_fight","skeleton_joins","threat_reassessment","tunnel_vision"], priority: 85, actions: ["reassess_threat","prioritize_skeleton","avoid_tunnel_vision","find_cover","retreat_if_overwhelmed"], hazards: ["multiple_threats"] },
    25: { name: "creeper_destroys_entrance", triggers: ["creeper_explosion","shelter_entrance_destroyed","terrain_changed","exposed","emergency_retreat"], priority: 95, actions: ["assess_terrain_change","emergency_retreat","find_new_cover","rebuild_if_safe","avoid_exposed"], hazards: ["explosion","exposed"] },
    26: { name: "skeleton_knocks_toward_cliff", triggers: ["skeleton_knockback","cliff","night","knockback_recovery","safe_landing","threat_avoidance"], priority: 90, actions: ["knockback_recovery","sneak_near_cliff","safe_landing","retreat_from_skeleton","avoid_edge"], hazards: ["knockback","cliff","skeleton"] },
    27: { name: "spider_zombie_pursue_into_cave", triggers: ["spider","zombie","pursue_into_cave","avoid_cornered","narrow_passage_control"], priority: 85, actions: ["avoid_cornered","control_narrow_passage","fight_in_chokepoint","retreat_if_needed","use_blocks_to_block"], hazards: ["spider","zombie","trapped"] },
    28: { name: "hostile_group_wooden_sword", triggers: ["hostile_group","wooden_sword_only","weapon_disadvantage","resource_preservation","escape"], priority: 90, actions: ["assess_weapon_disadvantage","preserve_resources","escape_over_fight","find_better_weapon","avoid_group"], hazards: ["weapon_disadvantage","group"] },
    29: { name: "attacked_while_eating", triggers: ["attacked_while_eating","cancel_or_complete_eating","immediate_danger"], priority: 80, actions: ["assess_immediate_danger","cancel_eating_if_threat_close","complete_if_safe","equip_weapon","retreat"], hazards: ["interrupted_heal"] },
    30: { name: "village_at_night_zombies", triggers: ["village","night","zombies_nearby","secure_shelter","village_entry","villager_threats"], priority: 85, actions: ["secure_shelter_in_village","check_house_safety","barricade_doors","light_up","avoid_villager_harm"], hazards: ["zombie","village"] },
};

// ===== RESOURCE SHORTAGES 31-45 =====
export const RESOURCE_SHORTAGES = {
    31: { name: "no_wood_low_hunger_sunset", triggers: ["no_wood","low_hunger","sunset"], priority: 95, actions: ["prioritize_wood_safely","find_food_quick","build_minimal_shelter","avoid_dark"], hazards: ["sunset","hunger","no_resources"] },
    32: { name: "wood_no_crafting_table", triggers: ["wood","no_crafting_table","crafting_dependency","hostile_exposure","minimal_shelter"], priority: 85, actions: ["craft_table_immediately","minimal_shelter_no_table","avoid_exposure","use_logs_as_shelter"], hazards: ["no_table","exposure"] },
    33: { name: "table_insufficient_planks_weapon_shelter", triggers: ["crafting_table","insufficient_planks","weapon_vs_shelter","resource_allocation"], priority: 80, actions: ["allocate_planks_weapon_first","shelter_with_dirt","prioritize_weapon_over_shelter","gather_more_wood_if_safe"], hazards: ["allocation"] },
    34: { name: "wooden_pickaxe_breaks_before_stone", triggers: ["pickaxe_breaks","no_stone","replace_tool_or_abandon"], priority: 75, actions: ["check_if_stone_nearby","craft_new_pickaxe_if_wood","abandon_if_no_wood","use_hands_for_dirt_shelter"], hazards: ["tool_break"] },
    35: { name: "stone_no_coal_torches", triggers: ["stone","no_coal","no_torches","darkness","alternative_light","retreat"], priority: 80, actions: ["use_charcoal_if_wood","darkness_management","retreat_to_surface","avoid_deep","craft_torch_from_charcoal"], hazards: ["darkness"] },
    36: { name: "food_runs_out_returning", triggers: ["food_out","distant_resource","safe_food_acquisition_vs_shelter"], priority: 85, actions: ["find_food_nearby","shelter_if_night","avoid_long_travel","hunt_passive_if_safe"], hazards: ["hunger","distance"] },
    37: { name: "inventory_full_low_value_before_night", triggers: ["inventory_full","low_value_items","nightfall","discard_priorities","retain_essentials"], priority: 80, actions: ["discard_low_value","retain_essentials","keep_blocks_and_food","drop_dirt_gravel"], hazards: ["inventory_full"] },
    38: { name: "iron_no_furnace_fuel", triggers: ["iron_found","no_furnace","no_fuel","progression_vs_night_risk"], priority: 85, actions: ["assess_night_risk","remember_iron_pos","craft_furnace_if_cobble","use_planks_as_fuel","retreat_if_night"], hazards: ["progression","night"] },
    39: { name: "food_across_river_hostile", triggers: ["food_across_river","hostile_mobs","route_risk","resource_value","alternative"], priority: 75, actions: ["assess_route_risk","check_alternative_food","cross_if_safe","avoid_if_hostile_heavy","find_boat"], hazards: ["river","hostile"] },
    40: { name: "shelter_materials_dirt_few_logs", triggers: ["dirt","few_logs","minimal_viable_defense","entrance_placement","emergency_exit"], priority: 85, actions: ["build_minimal_dirt_shelter","entrance_1_block_with_block","emergency_exit_second","use_logs_for_roof","sneak_placement"], hazards: ["minimal_resources"] },
    41: { name: "wood_for_bed_no_wool", triggers: ["wood_for_bed","no_wool","bed_dependency","nighttime_alternative"], priority: 70, actions: ["search_sheep","alternative_shelter","remember_wool_need","avoid_bed_dependency"], hazards: ["no_wool"] },
    42: { name: "wool_no_wood_for_bed", triggers: ["wool","no_wood_for_bed","resource_search","shelter_tradeoff"], priority: 70, actions: ["search_wood","craft_bed_if_possible","shelter_tradeoff","use_wool_as_block_if_desperate"], hazards: ["no_wood"] },
    43: { name: "weapon_durability_exhausted", triggers: ["weapon_durability_low","no_replacement_materials","retreat_planning","alternative_defensive"], priority: 85, actions: ["retreat_planning","preserve_weapon","use_fists_only_if_no_choice","find_materials","avoid_combat"], hazards: ["tool_break"] },
    44: { name: "food_no_weapon_passive_near_hostile", triggers: ["food","no_weapon","passive_near_hostile","safe_acquisition_vs_bypass"], priority: 75, actions: ["assess_safe_acquisition","bypass_if_hostile_heavy","craft_weapon_first","use_blocks_as_weapon_if_desperate"], hazards: ["no_weapon","hostile"] },
    45: { name: "valuable_loot_no_blocks_ravine", triggers: ["valuable_loot","no_blocks","ravine","preserve_loot","safe_route","avoid_forced_jumps"], priority: 90, actions: ["preserve_loot","find_safe_route","avoid_forced_jumps","gather_blocks_if_safe","retreat_if_no_route"], hazards: ["ravine","valuable_loss"] },
};

// ===== SHELTER/NAV FAILURES 46-60 =====
export const SHELTER_FAILURES = {
    46: { name: "dig_hillside_opens_cave_mobs", triggers: ["dig_hillside","opens_cave","mobs","unexpected_exposure","entrance_sealing","retreat"], priority: 90, actions: ["seal_entrance_immediately","retreat_if_mobs","assess_cave_threat","find_alternative_shelter","light_if_have"], hazards: ["cave_mobs","exposure"] },
    47: { name: "shelter_entrance_flooded", triggers: ["shelter_flooded","water","block_source","escape_another_opening","avoid_drowning"], priority: 95, actions: ["find_water_source","block_water","escape_another_opening","avoid_drowning","use_dirt_to_block"], hazards: ["flood","drowning"] },
    48: { name: "gravel_collapses_exit", triggers: ["gravel_collapse","only_exit","excavation_risk","alternate_escape","time_pressure"], priority: 90, actions: ["excavate_gravel_carefully","find_alternate_escape","avoid_falling_gravel","use_torch_to_break_gravel","time_management"], hazards: ["gravel","trapped"] },
    49: { name: "shelter_too_close_cliff", triggers: ["shelter_near_cliff","entrance_safety","knockback_risk","repositioning"], priority: 80, actions: ["assess_cliff_distance","reposition_entrance_away","avoid_knockback_toward_cliff","build_barrier","sneak_near_edge"], hazards: ["cliff","knockback"] },
    50: { name: "cave_two_exits_one_skeleton", triggers: ["cave_two_exits","skeleton_occupies_one","route_selection","cover","exit_control"], priority: 85, actions: ["select_safe_exit","cover_from_skeleton","control_exit","avoid_skeleton_LOS","use_other_exit"], hazards: ["skeleton","route"] },
    51: { name: "lose_spawn_direction_fleeing", triggers: ["lose_spawn_direction","fleeing_mobs","orientation_recovery","safe_landmarks","route_planning"], priority: 75, actions: ["use_compass_if_have","mark_with_torches","recover_orientation","find_safe_landmark","avoid_wandering"], hazards: ["disorientation"] },
    52: { name: "night_forest_no_shelter", triggers: ["night","forest","no_clear_shelter","tree_density","nearby_terrain","minimal_defensive"], priority: 85, actions: ["use_tree_density_as_cover","find_nearby_terrain_hill","minimal_defensive_construction","pillar_2_high","avoid_open"], hazards: ["forest","night","no_shelter"] },
    53: { name: "trapped_river_hostile", triggers: ["trapped","river","hostile_mobs","swimming_risk","alternate_crossing","defensive_positioning"], priority: 85, actions: ["assess_swimming_risk","find_alternate_crossing","defensive_positioning","use_boat_if_have","avoid_water_if_drowned"], hazards: ["river","hostile"] },
    54: { name: "shelter_safe_food_tools_outside_hostile", triggers: ["shelter_safe","food_tools_outside","hostile_mobs","retrieval_necessity"], priority: 80, actions: ["assess_retrieval_necessity","wait_if_food_enough","retrieve_if_critical","create_second_exit","avoid_unnecessary_risk"], hazards: ["retrieval","hostile"] },
    55: { name: "blocks_inside_one_block_entrance", triggers: ["blocks_inside","one_block_entrance","escape_options","reopen_safely"], priority: 85, actions: ["verify_escape_options","reopen_route_safely","avoid_trapping","keep_one_block_open","place_block_removable"], hazards: ["self_trapped"] },
    56: { name: "shelter_dark_unlit_chamber", triggers: ["shelter_dark","unlit_chamber","local_spawn_risk","lighting_priorities","safe_movement"], priority: 85, actions: ["light_chamber_immediately","prioritize_lighting","safe_movement","avoid_dark_corners","place_torch"], hazards: ["spawn","darkness"] },
    57: { name: "hostile_enters_while_mining_interior", triggers: ["hostile_enters","mining_interior","immediate_combat","doorway_escape","enclosure_safety"], priority: 90, actions: ["immediate_combat_or_escape","doorway_escape","enclosure_safety","block_entrance","retreat"], hazards: ["shelter_breach"] },
    58: { name: "village_houses_occupied_obstructed", triggers: ["village","houses_occupied","obstructed","alternate_building","defensive_position","resource_constraints"], priority: 80, actions: ["find_unoccupied_house","alternate_building_near_village","defensive_position","use_village_resources","barricade"], hazards: ["village","occupied"] },
    59: { name: "shelter_safe_zombie_but_skeleton_arrows", triggers: ["safe_from_zombie","exposed_to_skeleton","LOS_analysis","repositioning","entrance_redesign"], priority: 85, actions: ["LOS_analysis_skeleton","reposition_entrance","redesign_entrance_with_wall","block_arrow_LOS","stay_low"], hazards: ["skeleton","LOS"] },
    60: { name: "cannot_find_shelter_before_sunset", triggers: ["cannot_find_shelter","built_before_sunset","landmark_tracking","fallback_shelter","avoid_wandering"], priority: 85, actions: ["track_landmarks","fallback_shelter_dirt","avoid_wandering_indefinitely","build_emergency","use_torches_as_markers"], hazards: ["lost","sunset"] },
};

// ===== MULTI-PROBLEM 61-80 - HIGH VALUE =====
export const MULTI_PROBLEM = {
    61: { name: "4hp_3_skeletons_zombie_sunset", triggers: ["4_hp","3_skeletons","zombie","sunset"], priority: 100, actions: ["immediate_survival","LOS_control","no_unnecessary_combat","find_cover","heal_if_food","retreat_to_shelter"], hazards: ["low_hp","ranged_swarm","sunset"], critical: true },
    62: { name: "flooding_cave_broken_pickaxe_low_hunger", triggers: ["flooding_cave","broken_pickaxe","low_hunger"], priority: 95, actions: ["oxygen_management","escape_route_no_mine","tool_dependency_check","abandon_ore","find_air","avoid_hunger_sprint"], hazards: ["flood","tool_break","hunger"], critical: true },
    63: { name: "creeper_behind_ravine_ahead_skeleton_above", triggers: ["creeper_behind","ravine_ahead","skeleton_above"], priority: 100, actions: ["threat_positioning","route_feasibility","safe_disengagement","avoid_ravine_if_creeper_close","cover_from_skeleton","perpendicular_escape"], hazards: ["creeper","ravine","skeleton"], critical: true },
    64: { name: "fall_cave_2_zombies_no_torches_broken_weapon", triggers: ["fall_cave","2_zombies","no_torches","broken_weapon"], priority: 95, actions: ["escape_over_combat","avoid_combat_if_possible","resource_conservation","find_exit","use_fists_only_if_trapped"], hazards: ["zombie","darkness","tool_break"], critical: true },
    65: { name: "lava_pool_iron_sunset_no_food", triggers: ["lava_pool","valuable_iron","sunset","no_food"], priority: 90, actions: ["resource_temptation_assessment","exposure_time_limit","safe_retreat","remember_iron_for_later","avoid_lava_at_night"], hazards: ["lava","sunset","hunger"], critical: true },
    66: { name: "full_inventory_valuable_low_health_hostile", triggers: ["full_inventory","valuable_loot","low_health","hostile_mobs"], priority: 95, actions: ["selective_discarding","threat_avoidance","recovery_priority","drop_low_value","retain_critical","escape"], hazards: ["inventory_full","low_hp","hostile"], critical: true },
    67: { name: "no_shelter_rain_3_hostile_low_durability", triggers: ["no_shelter","rain","3_hostile","low_durability"], priority: 95, actions: ["minimal_defense","route_selection","survival_over_fighting","find_cover","avoid_rain_if_phantom","preserve_durability"], hazards: ["no_shelter","hostile","low_dura"], critical: true },
    68: { name: "lost_forest_low_hunger_night_no_weapon", triggers: ["lost_forest","low_hunger","night","no_weapon"], priority: 95, actions: ["orientation","safe_shelter","food_prioritization","craft_weapon_first","avoid_mobs","use_trees_as_shelter"], hazards: ["lost","hunger","night","no_weapon"], critical: true },
    69: { name: "water_tunnel_skeleton_exit_oxygen_low", triggers: ["water_tunnel","skeleton_exit","oxygen_low"], priority: 100, actions: ["immediate_breathable_space","alternate_exit","combat_only_if_unavoidable","find_air_pocket","avoid_skeleton_if_possible"], hazards: ["drowning","skeleton"], critical: true },
    70: { name: "ravine_fall_3hp_food_inventory_hostile_above", triggers: ["ravine_fall","3_hp","food_in_inventory","hostile_above"], priority: 100, actions: ["safe_positioning","realistic_healing","vertical_escape","eat_if_safe","cover_from_above","pillar_if_blocks"], hazards: ["low_hp","fall","hostile"], critical: true },
    71: { name: "shelter_entrance_destroyed_creeper_no_blocks", triggers: ["shelter_entrance_destroyed","creeper_approaching","no_blocks_selected"], priority: 95, actions: ["emergency_movement","equipment_switching","explosion_avoidance","select_blocks","retreat"], hazards: ["creeper","no_blocks"], critical: true },
    72: { name: "iron_ore_pickaxe_broken_zombies_no_shelter", triggers: ["iron_ore","pickaxe_broken","zombies","no_shelter"], priority: 90, actions: ["stop_gathering","escape","preserve_critical_equipment","remember_iron","find_shelter"], hazards: ["iron","tool_break","zombie"], critical: true },
    73: { name: "nightfall_village_pillager_no_armor", triggers: ["nightfall","village_nearby","pillager_patrol","no_armor"], priority: 85, actions: ["assess_village_safety_vs_shelter","avoid_pillager_if_no_armor","choose_safer_route","barricade_if_village","retreat_if_patrol_heavy"], hazards: ["pillager","village","no_armor"], critical: true },
    74: { name: "low_health_poison_skeletons_narrow_cave", triggers: ["low_health","poison","skeletons","narrow_cave"], priority: 100, actions: ["damage_over_time_management","cover","escape_prioritization","find_wider_area","avoid_poison_extension"], hazards: ["poison","skeleton","low_hp"], critical: true },
    75: { name: "water_drowned_low_oxygen_blocked_shore", triggers: ["water","drowned","low_oxygen","blocked_shore"], priority: 95, actions: ["locate_breathable_space","evade_attacks","find_another_exit","surface","boat_if_have"], hazards: ["drowned","drowning","blocked"], critical: true },
    76: { name: "tool_breaks_gravel_blocks_route_hostile", triggers: ["tool_breaks","gravel_blocks_route","hostile_approach"], priority: 85, actions: ["reassess_excavation_methods","alternative_passages","use_hands_for_gravel","find_other_route","avoid_hostile"], hazards: ["tool_break","gravel","hostile"], critical: true },
    77: { name: "creeper_explosion_food_low_health_second_creeper", triggers: ["creeper_explosion","dropped_food","low_health","second_creeper"], priority: 95, actions: ["abandon_loot_if_needed","escape_blast_radius","avoid_second_creeper","heal_if_safe"], hazards: ["creeper","low_hp"], critical: true },
    78: { name: "shelter_secure_food_outside_skeleton_guards", triggers: ["shelter_secure","food_outside","skeleton_guards_entrance"], priority: 85, actions: ["decide_wait_vs_retrieve","create_another_exit","retrieve_if_critical","avoid_skeleton_LOS","use_cover"], hazards: ["skeleton","food_outside"], critical: true },
    79: { name: "hunger_depletion_hostile_long_route_spawn_night", triggers: ["hunger_depletion","hostile","long_route_spawn","night"], priority: 90, actions: ["avoid_unnecessary_travel","seek_nearby_shelter","safe_food","avoid_long_route","build_emergency_shelter"], hazards: ["hunger","hostile","night"], critical: true },
    80: { name: "respawn_first_night_death_no_equipment_distant_drops_night_mobs", triggers: ["respawn","first_night_death","no_equipment","distant_drops","night_mobs"], priority: 95, actions: ["calculate_recovery_value","rebuild_minimum_equipment","wait_safer_conditions","assess_drop_distance","avoid_night_if_no_gear"], hazards: ["respawn","no_gear","night"], critical: true },
};

export const ALL_SCENARIOS = { ...FALL_SCENARIOS, ...NIGHT_COMBAT, ...RESOURCE_SHORTAGES, ...SHELTER_FAILURES, ...MULTI_PROBLEM };

export function detectScenario(context) {
    // context: {hp, hunger, time (sunset/night/day), location (ravine/cave/water/lava/mountain/forest/river), threats list, inventory, equipment, hasBlocks, hasTorch, hasWater, hasWeapon, depth, oxygen, etc}
    const detected = [];
    const hp = context.hp ?? 20;
    const hunger = context.hunger ?? 20;
    const threats = context.threats ?? [];
    const count = threats.length;
    const hasRanged = threats.filter(t => t.typeId.includes("skeleton") || t.typeId.includes("pillager") || t.typeId === "minecraft:blaze").length;
    const hasCreeper = threats.some(t => t.typeId === "minecraft:creeper");
    const hasZombie = threats.some(t => t.typeId.includes("zombie"));
    const hasSpider = threats.some(t => t.typeId.includes("spider"));
    const hasDrowned = threats.some(t => t.typeId === "minecraft:drowned");
    const hasWitch = threats.some(t => t.typeId === "minecraft:witch");
    const isSunset = context.time === "sunset";
    const isNight = context.time === "night";
    const isLowHp = hp <= 6;
    const isLowHunger = hunger <= 6;
    const noWeapon = !context.hasWeapon;
    const noTorch = !context.hasTorch;
    const inRavine = context.location === "ravine";
    const inCave = context.location === "cave";
    const inWater = context.location === "water";
    const nearLava = context.nearLava;
    const onLedge = context.onLedge;
    const tooDeep = context.tooDeep;
    const oxygenLow = context.oxygenLow;
    const inventoryFull = context.inventoryFull;
    const lowDurability = context.lowDurability;
    const noShelter = context.noShelter;
    const flooded = context.flooded;
    const gravelCollapse = context.gravelCollapse;

    // Check each scenario's triggers
    for (const [id, scen] of Object.entries(ALL_SCENARIOS)) {
        let score = 0;
        for (const trig of scen.triggers) {
            if (trig === "low_hp" && isLowHp) score++;
            if (trig === "4_hp" && hp <= 4) score++;
            if (trig === "3_hp" && hp <= 3) score++;
            if (trig === "low_hunger" && isLowHunger) score++;
            if (trig === "empty_hunger" && hunger <= 4) score++;
            if (trig === "sunset" && isSunset) score++;
            if (trig === "night" && isNight) score++;
            if (trig === "ravine" && inRavine) score++;
            if (trig === "cave" && inCave) score++;
            if (trig === "water" && inWater) score++;
            if (trig === "lava" && nearLava) score++;
            if (trig === "skeleton" && hasRanged) score++;
            if (trig === "3_skeletons" && hasRanged >= 3) score++;
            if (trig === "zombie" && hasZombie) score++;
            if (trig === "creeper" && hasCreeper) score++;
            if (trig === "spider" && hasSpider) score++;
            if (trig === "drowned" && hasDrowned) score++;
            if (trig === "witch" && hasWitch) score++;
            if (trig === "no_torches" && noTorch) score++;
            if (trig === "no_weapon" && noWeapon) score++;
            if (trig === "too_deep" && tooDeep) score++;
            if (trig === "oxygen_low" && oxygenLow) score++;
            if (trig === "inventory_full" && inventoryFull) score++;
            if (trig === "low_durability" && lowDurability) score++;
            if (trig === "no_shelter" && noShelter) score++;
            if (trig === "flooded" && flooded) score++;
            if (trig === "gravel" && gravelCollapse) score++;
            if (trig === "ledge" && onLedge) score++;
            if (trig.includes("_") && context.triggers?.includes(trig)) score++;
        }
        if (score >= 2 || (scen.critical && score >= 1)) {
            detected.push({ id: parseInt(id), ...scen, matchScore: score });
        }
    }
    detected.sort((a,b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || b.priority - a.priority || b.matchScore - a.matchScore);
    return detected;
}

export function planForScenario(scenario, context) {
    // Returns action plan with priorities
    const actions = scenario.actions.map((act, idx) => ({
        action: act,
        priority: scenario.priority - idx,
        reason: `${scenario.name}: ${act}`
    }));
    return {
        scenario: scenario.name,
        id: scenario.id,
        priority: scenario.priority,
        critical: scenario.critical ?? false,
        actions,
        hazards: scenario.hazards
    };
}

export function bestActionForContext(context) {
    const detected = detectScenario(context);
    if (!detected.length) return null;
    const top = detected[0];
    return planForScenario(top, context);
}

// ===== SPECIFIC LOGIC HELPERS =====

export function assessFallDepth(fromY, toY, hasWaterBucket, hasBlocks, hp) {
    const depth = fromY - toY;
    if (depth <= 3) return { risk: "low", action: "walk", need: "none" };
    if (depth <= 6) return { risk: "medium", action: "pillar_or_ladder", need: hasBlocks ? "blocks" : "find_blocks", hpCheck: hp > 6 };
    if (depth <= 12) {
        if (hasWaterBucket) return { risk: "high", action: "water_clutch", need: "water_bucket" };
        if (hasBlocks) return { risk: "high", action: "pillar_safe", need: "blocks_12" };
        return { risk: "extreme", action: "find_alternate_route", need: "blocks_or_water" };
    }
    return { risk: "lethal", action: "avoid_or_water_clutch", need: "water_bucket_critical", abort: true };
}

export function assessNightThreat(threats, time, hasShelter, hp) {
    const count = threats.length;
    const ranged = threats.filter(t => t.typeId.includes("skeleton")).length;
    const explosive = threats.filter(t => t.typeId === "minecraft:creeper").length;
    if (count >= 4 && (time === "sunset" || time === "night") && !hasShelter) {
        return { decision: "build_emergency_shelter_or_retreat", priority: 100, reason: "night + many mobs no shelter" };
    }
    if (ranged >= 3) return { decision: "cover_and_LOS_break", priority: 95, reason: "ranged swarm" };
    if (explosive >= 2) return { decision: "separate_creepers", priority: 100, reason: "creeper swarm" };
    if (hp <= 6) return { decision: "flee_no_combat", priority: 100, reason: "low hp night" };
    return { decision: "fight_or_retreat", priority: 70 };
}

export function resourcePriority(noWood, lowHunger, sunset, hasTable, hasPlanks, hasPickaxe, hasCoal, inventoryFull) {
    if (noWood && lowHunger && sunset) return { priority: "wood_first_then_food_then_shelter", reason: "sunset no wood low hunger" };
    if (!hasTable) return { priority: "craft_table_immediately", reason: "crafting dependency" };
    if (!hasPlanks) return { priority: "weapon_first_then_shelter", reason: "insufficient planks" };
    if (!hasPickaxe) return { priority: "replace_tool", reason: "pickaxe breaks" };
    if (!hasCoal) return { priority: "charcoal_or_retreat", reason: "no coal torches" };
    if (inventoryFull) return { priority: "discard_low_retain_essential", reason: "full inventory" };
    return { priority: "upskill", reason: "resource ok" };
}

export function shelterFailurePlan(failureType, context) {
    const plans = {
        cave_open: { action: "seal_entrance", need: "blocks", fallback: "retreat" },
        flooded: { action: "block_water_source", need: "dirt", fallback: "escape_other_opening" },
        gravel_collapse: { action: "excavate_carefully_with_torch", need: "torch_breaks_gravel", fallback: "alternate_exit" },
        cliff: { action: "reposition_away", need: "distance_5", fallback: "build_barrier" },
        skeleton_exit: { action: "use_other_exit", need: "cover", fallback: "kill_skeleton_with_cover" },
        lost: { action: "landmark_torches", need: "torches", fallback: "emergency_shelter" },
        river_trapped: { action: "boat_or_bridge", need: "boat_or_blocks", fallback: "defensive_position" },
        dark_chamber: { action: "light_immediately", need: "torch", fallback: "retreat_to_lit" },
        self_blocked: { action: "reopen_safely", need: "pickaxe", fallback: "break_one_block" },
    };
    return plans[failureType] ?? { action: "assess_and_retreat", need: "general" };
}

export function multiRiskPriority(context) {
    // For 61-80: combine risks
    let totalRisk = 0;
    if (context.hp <= 4) totalRisk += 40;
    else if (context.hp <= 6) totalRisk += 25;
    if (context.hunger <= 4) totalRisk += 20;
    if (context.threats?.length >= 3) totalRisk += 20;
    if (context.time === "sunset" || context.time === "night") totalRisk += 15;
    if (context.noShelter) totalRisk += 15;
    if (context.oxygenLow) totalRisk += 30;
    if (context.nearLava) totalRisk += 25;
    if (context.inventoryFull) totalRisk += 10;
    if (context.lowDurability) totalRisk += 10;
    if (context.flooded) totalRisk += 20;

    if (totalRisk >= 80) return { level: "critical", action: "immediate_survival_no_combat", priority: 100 };
    if (totalRisk >= 60) return { level: "high", action: "escape_and_heal", priority: 90 };
    if (totalRisk >= 40) return { level: "medium", action: "cautious_retreat", priority: 80 };
    return { level: "low", action: "continue_with_caution", priority: 60 };
}

// ---------------------------------------------------------------- survival-capabilities.js

/**
 * Survival Capabilities - replaces 80 numbered scenarios with small composable set
 * Each capability is testable via fixtures
 */

export const CAPABILITIES = {
    ESCAPE: "escape",           // flee from danger, find safe spot
    BRIDGE: "bridge",           // bridge gaps, tower up, build cover
    COMBAT_RETREAT: "combat_retreat", // retreat when low health, many mobs
    FIND_FOOD: "find_food",     // locate and gather food
    FIND_SHELTER: "find_shelter", // find or build shelter at night
    HEAL: "heal",               // eat, regen
    MINE_RESOURCE: "mine_resource", // mine specific resource with tool tier
    NAVIGATE: "navigate",       // pathfind to target
    WATER_CROSSING: "water_crossing", // boat, swim, bridge over water
    LAVA_AVOIDANCE: "lava_avoidance", // avoid lava, make obsidian safely
    DARKNESS_LIGHT: "darkness_light", // place torches, avoid dark
    FALL_RECOVERY: "fall_recovery"  // recover from fall, water bucket clutch
};

export const CAPABILITY_TESTS = {
    [CAPABILITIES.ESCAPE]: [
        { scenario: "ravine_zombie", threats: ["zombie"], terrain: "ravine", health: 12 },
        { scenario: "mountain_skeleton", threats: ["skeleton"], terrain: "mountain", health: 8 },
        { scenario: "cave_spider", threats: ["cave_spider"], terrain: "cave", health: 10 }
    ],
    [CAPABILITIES.BRIDGE]: [
        { scenario: "gap_3_blocks", gap: 3, hasBlocks: true },
        { scenario: "gap_5_blocks_place_jump", gap: 5, hasBlocks: true },
        { scenario: "tower_20_blocks", vertical: 20, hasBlocks: true },
        { scenario: "tower_100_blocks", vertical: 100, hasBlocks: true }
    ],
    [CAPABILITIES.COMBAT_RETREAT]: [
        { scenario: "4hp_3_skeletons", health: 4, threats: ["skeleton","skeleton","skeleton"] },
        { scenario: "creeper_close", health: 10, threats: ["creeper"], closest: 3 },
        { scenario: "8_mobs_swarm", health: 12, threatCount: 8 }
    ],
    [CAPABILITIES.FIND_FOOD]: [
        { scenario: "hunger_4_no_food", hunger: 4, food: 0 },
        { scenario: "village_food", hunger: 8, hasVillage: true }
    ],
    [CAPABILITIES.FIND_SHELTER]: [
        { scenario: "night_no_shelter", time: "night", hasShelter: false },
        { scenario: "rain_no_shelter", time: "rain", hasShelter: false }
    ],
    [CAPABILITIES.MINE_RESOURCE]: [
        { scenario: "any_log", target: "#logs", hasAxe: false },
        { scenario: "iron_ore", target: "iron_ore", hasPickaxeTier: 2 },
        { scenario: "diamond_ore", target: "diamond_ore", hasPickaxeTier: 3 }
    ]
};

export function evaluateCapability(capability, context) {
    switch (capability) {
        case CAPABILITIES.ESCAPE:
            return {
                needed: context.threatCount >= 2 || context.health <= 8 || context.inWater || context.belowHazard,
                priority: context.health <= 4 ? 100 : context.threatCount >= 3 ? 90 : 70,
                reason: `escape needed: health=${context.health} threats=${context.threatCount} water=${context.inWater}`
            };
        case CAPABILITIES.BRIDGE:
            return {
                needed: context.gapSize >= 3 || context.verticalDiff > 8 || context.needCover,
                priority: context.verticalDiff > 20 ? 85 : context.gapSize >= 4 ? 75 : 60,
                reason: `bridge needed: gap=${context.gapSize} vertical=${context.verticalDiff}`
            };
        case CAPABILITIES.COMBAT_RETREAT:
            return {
                needed: context.health <= 8 || context.threatCount >= 4 || context.bombNear,
                priority: context.health <= 4 ? 95 : context.threatCount >= 4 ? 85 : 70,
                reason: `retreat needed: health=${context.health} threats=${context.threatCount} bomb=${context.bombNear}`
            };
        case CAPABILITIES.FIND_FOOD:
            return {
                needed: context.hunger <= 10 || context.foodCount < 3,
                priority: context.hunger <= 4 ? 90 : context.hunger <= 8 ? 75 : 50,
                reason: `food needed: hunger=${context.hunger} food=${context.foodCount}`
            };
        case CAPABILITIES.MINE_RESOURCE:
            return {
                needed: !!context.targetBlock,
                priority: context.targetBlock === "#logs" ? 100 : 70,
                reason: `mine needed: ${context.targetBlock}`
            };
        default:
            return { needed: false, priority: 0, reason: "unknown capability" };
    }
}

export function composeCapabilities(contexts) {
    // Mix of two situations should not fall through - compose multiple capabilities
    const needed = [];
    for (const cap of Object.values(CAPABILITIES)) {
        const evalResult = evaluateCapability(cap, contexts);
        if (evalResult.needed) {
            needed.push({ capability: cap, ...evalResult });
        }
    }
    needed.sort((a,b) => b.priority - a.priority);
    return needed;
}

// ---------------------------------------------------------------- food-strategy.js

/**
 * Food, Healing & Combat Readiness - core logic.
 * Maintain sufficient food for exploration, sprinting, combat, emergency recovery.
 * Track hunger, health, saturation where observable, availability replacement food.
 * Before dangerous fight, eat when necessary and when situation allows safely.
 * Avoid beginning combat with critical health or insufficient resources unless no safer alternative.
 * Prioritize escape, cover, survival when facing multiple hostile mobs or unfavorable encounters.
 * Recognize every hostile entity and adjust combat tactics to its attack pattern, range, movement, environmental advantages.
 * After taking damage, reassess situation instead of blindly continuing original plan.
 */

export const FOOD_VALUES = {
    "minecraft:bread": { hunger: 5, saturation: 6, healPotential: 2.5 },
    "minecraft:cooked_beef": { hunger: 8, saturation: 12.8, healPotential: 6.4 },
    "minecraft:cooked_porkchop": { hunger: 8, saturation: 12.8, healPotential: 6.4 },
    "minecraft:cooked_chicken": { hunger: 6, saturation: 7.2, healPotential: 3.6 },
    "minecraft:baked_potato": { hunger: 5, saturation: 6, healPotential: 3 },
    "minecraft:carrot": { hunger: 3, saturation: 3.6, healPotential: 1.8 },
    "minecraft:apple": { hunger: 4, saturation: 2.4, healPotential: 1.2 },
    "minecraft:golden_apple": { hunger: 4, saturation: 9.6, healPotential: 10, effect: "regen_absorption" },
    "minecraft:enchanted_golden_apple": { hunger: 4, saturation: 9.6, healPotential: 20, effect: "regen_absorption_resist_fire" },
    "minecraft:cooked_mutton": { hunger: 6, saturation: 9.6, healPotential: 4.8 },
    "minecraft:beef": { hunger: 3, saturation: 1.8, healPotential: 0.9, raw: true },
    "minecraft:porkchop": { hunger: 3, saturation: 1.8, healPotential: 0.9, raw: true },
    "minecraft:chicken": { hunger: 2, saturation: 1.2, healPotential: 0.6, raw: true, risky: true },
    "minecraft:rotten_flesh": { hunger: 4, saturation: 0.8, healPotential: 0.4, risky: true, effect: "hunger" },
};

export const COMBAT_FOOD_THRESHOLD = {
    // Hunger thresholds for combat readiness
    critical: 6, // must eat
    low: 14, // should eat before dangerous fight
    safe: 18, // safe to fight
    sprint: 6, // below cannot sprint
};

export const HEALTH_THRESHOLDS = {
    critical: 6, // must retreat/heal, avoid combat
    low: 10, // avoid dangerous fights
    medium: 14, // cautious
    safe: 18, // safe to fight
};

export function assessFoodReserves(inventory, context = {}) {
    // context may contain hunger, health for richer reasoning, but inventory is primary
    let totalHunger = 0;
    let totalSaturation = 0;
    let foodCount = 0;
    let bestFood = null;
    let bestValue = -1;

    for (const [type, amount] of Object.entries(inventory)) {
        const food = FOOD_VALUES[type];
        if (!food) continue;
        totalHunger += food.hunger * amount;
        totalSaturation += food.saturation * amount;
        foodCount += amount;
        const value = food.hunger + food.saturation;
        if (value > bestValue) {
            bestValue = value;
            bestFood = type;
        }
    }

    // If context provides current hunger/health, use for status
    const curHunger = context.hunger ?? 20;
    const curHealth = context.health ?? 20;

    let status = "ok";
    if (totalHunger < 10 || curHunger <= COMBAT_FOOD_THRESHOLD.critical) status = "critical";
    else if (totalHunger < 20 || curHunger <= COMBAT_FOOD_THRESHOLD.low) status = "low";

    return {
        totalHunger,
        totalSaturation,
        foodCount,
        bestFood,
        status,
        sufficientForExploration: totalHunger >= 20,
        sufficientForCombat: totalHunger >= 30,
        sufficientForEmergency: totalHunger >= 10,
        needMore: totalHunger < 20,
        reason: `food reserves: ${foodCount} items, ${totalHunger} hunger, ${totalSaturation.toFixed(1)} saturation, best ${bestFood}, status ${status} (cur hunger ${curHunger} health ${curHealth})`
    };
}

export function shouldEatBeforeFight(hunger, health, threatCount, threatTypes) {
    // Before initiating potentially dangerous fight, eat when necessary and when situation allows safely
    if (hunger <= COMBAT_FOOD_THRESHOLD.critical) {
        return { shouldEat: true, reason: `hunger ${hunger} <= critical ${COMBAT_FOOD_THRESHOLD.critical}, must eat before any fight`, priority: 100 };
    }
    if (health <= HEALTH_THRESHOLDS.critical) {
        return { shouldEat: true, reason: `health ${health} <= critical ${HEALTH_THRESHOLDS.critical}, heal before fight if possible`, priority: 95, needSafe: true };
    }

    const isDangerousFight = threatCount >= 3 || threatTypes.some(t => t.includes("creeper") || t.includes("skeleton") || t.includes("witch") || t.includes("blaze"));
    if (isDangerousFight) {
        if (hunger <= COMBAT_FOOD_THRESHOLD.low) {
            return { shouldEat: true, reason: `dangerous fight ${threatCount} mobs, hunger ${hunger} <= low ${COMBAT_FOOD_THRESHOLD.low}, eat if safe`, priority: 85, needSafe: true };
        }
        if (health <= HEALTH_THRESHOLDS.low) {
            return { shouldEat: true, reason: `dangerous fight, health ${health} <= low ${HEALTH_THRESHOLDS.low}, heal if safe`, priority: 85, needSafe: true };
        }
    }

    if (hunger <= COMBAT_FOOD_THRESHOLD.safe && threatCount === 1) {
        return { shouldEat: false, reason: `hunger ${hunger} <= safe but single mob, can fight then eat`, priority: 40 };
    }

    return { shouldEat: false, reason: `hunger ${hunger} health ${health} sufficient for fight`, priority: 20 };
}

export function shouldAvoidCombat(health, hunger, foodReserves, equipment, threatCount, threatTypes) {
    // Avoid beginning combat with critical health or insufficient resources unless no safer alternative
    if (health <= HEALTH_THRESHOLDS.critical) {
        return { avoid: true, reason: `health ${health} <= critical ${HEALTH_THRESHOLDS.critical}, avoid combat unless no safer alternative`, priority: 100, alternative: "retreat" };
    }
    if (hunger <= COMBAT_FOOD_THRESHOLD.critical && foodReserves.foodCount === 0) {
        return { avoid: true, reason: `hunger ${hunger} critical and no food reserves, avoid combat`, priority: 90, alternative: "find_food" };
    }
    if (!equipment.hasWeapon) {
        return { avoid: true, reason: "no weapon, avoid combat, craft quick tool #1 priority", priority: 95, alternative: "craft_weapon" };
    }
    if (threatCount >= 4) {
        return { avoid: true, reason: `multiple hostile mobs ${threatCount}, prioritize escape cover survival`, priority: 90, alternative: "escape_cover" };
    }
    if (threatCount >= 2 && health <= HEALTH_THRESHOLDS.low) {
        return { avoid: true, reason: `low health ${health} + ${threatCount} mobs, unfavorable, escape`, priority: 85, alternative: "retreat" };
    }

    return { avoid: false, reason: "combat acceptable" };
}

export function prioritizeEscapeCoverSurvival(threats, health, hasCover, hasBlocks) {
    // Prioritize escape, cover, survival when facing multiple hostile mobs or unfavorable encounters
    const count = threats.length;
    const hasRanged = threats.some(t => t.typeId.includes("skeleton") || t.typeId.includes("blaze"));
    const hasExplosive = threats.some(t => t.typeId === "minecraft:creeper");

    if (count >= 3) {
        if (hasRanged && hasCover) {
            return { action: "cover", reason: `${count} mobs including ranged, use cover`, priority: 95 };
        }
        if (hasExplosive) {
            return { action: "retreat_from_creeper", reason: "explosive present, retreat", priority: 100 };
        }
        return { action: "escape", reason: `multiple mobs ${count}, escape over fight`, priority: 90 };
    }

    if (health <= HEALTH_THRESHOLDS.critical) {
        return { action: "retreat_heal", reason: `critical health ${health}, retreat and heal`, priority: 100 };
    }

    if (hasRanged && !hasCover && hasBlocks) {
        return { action: "build_cover", reason: "ranged without cover, build wall", priority: 85 };
    }

    return { action: "fight_or_retreat", reason: "situation manageable", priority: 50 };
}

export function adjustTacticForHostile(hostileType, context) {
    // Recognize every relevant hostile entity and adjust combat tactics to its attack pattern, range, movement, environmental advantages
    const { hasShield, hasWater, hasBlocks, health, distance } = context;

    // Use knowledge.js MOB_ADAPTIVE if available, else fallback
    const type = hostileType;

    if (type.includes("skeleton") || type.includes("stray") || type.includes("bogged")) {
        return {
            tactic: "cover_rush_strafe",
            pattern: "zigzag every 8 ticks, rush 4 blocks, use shield",
            range: "16 blocks ranged, close to 4 blocks",
            movement: "strafe perpendicular",
            environmental: "use cover, wall 2 high",
            needs: hasShield ? "shield ready" : "need shield for swarm",
            reason: "skeleton: ranged, strafe, cover, shield"
        };
    }
    if (type === "minecraft:creeper") {
        return {
            tactic: "hit_and_retreat",
            pattern: "hit once, retreat 6 blocks, avoid explosion radius 3",
            range: "3 blocks explosion, 1.5 melee",
            movement: "retreat after hit",
            environmental: "open ground, avoid confined",
            needs: "open space",
            reason: "creeper: explosive punishes standing still"
        };
    }
    if (type.includes("zombie") || type.includes("husk") || type.includes("drowned")) {
        return {
            tactic: "kite",
            pattern: "hit, step back, crit if on ground",
            range: "1.5 melee",
            movement: "kite backward",
            environmental: "avoid water if drowned, avoid hunger if husk",
            reason: "zombie: melee kite"
        };
    }
    if (type.includes("spider") || type.includes("cave_spider")) {
        return {
            tactic: "strafe_pillar",
            pattern: "strafe, jump, pillar if fast",
            range: "1.5 melee, climb",
            movement: "fast 0.32, strafe",
            environmental: "avoid walls (climb), pillar 2 high",
            needs: hasBlocks ? "blocks for pillar" : "open ground",
            reason: "spider: fast, climb, poison if cave spider"
        };
    }
    if (type === "minecraft:enderman") {
        return {
            tactic: "low_roof_water",
            pattern: "water first, then low roof 2 high, look at legs not eyes",
            range: "3 melee, teleport",
            movement: "avoid eye contact, water place",
            environmental: "low roof 2 high (enderman 3 tall), water",
            needs: hasWater ? "water bucket ready" : hasBlocks ? "blocks for low roof" : "retreat",
            reason: "enderman: water weak, low roof safe, no eye contact"
        };
    }
    if (type === "minecraft:blaze") {
        return {
            tactic: "dodge_rush_water",
            pattern: "dodge every 6 ticks, rush 4 blocks, water clutch if on fire",
            range: "16 ranged fireballs, flying",
            movement: "constant strafe",
            environmental: "cover from fireballs, water",
            needs: hasWater ? "water for fire" : "cover",
            reason: "blaze: fire, flying, strafe, water clutch"
        };
    }
    if (type === "minecraft:witch") {
        return {
            tactic: "rush",
            pattern: "rush quickly, avoid potion, no time to waste",
            range: "10 potion",
            movement: "rush",
            environmental: "cover if need heal",
            reason: "witch: potion threat, rush"
        };
    }
    if (type === "minecraft:ghast") {
        return {
            tactic: "cover_bow",
            pattern: "cover from fireballs, bow if have",
            range: "32 explosive",
            movement: "cover",
            environmental: "cover essential",
            reason: "ghast: long range explosive, cover"
        };
    }
    if (type === "minecraft:iron_golem") {
        return {
            tactic: "pillar_3_high",
            pattern: "pillar 3 high, golem cannot reach",
            range: "2.5 melee 14 damage",
            movement: "maintain separation 3+ blocks high",
            environmental: "elevated protected position",
            reason: "golem: heavy damage, pillar safe"
        };
    }
    if (type === "minecraft:warden" || type === "minecraft:ender_dragon" || type === "minecraft:wither") {
        return {
            tactic: "flee",
            pattern: "flee, no fight, boss",
            range: "boss",
            movement: "flee far",
            environmental: "avoid",
            reason: "boss: no fight unless endgame"
        };
    }

    // Default melee
    return {
        tactic: "kite",
        pattern: "kite, crit",
        range: "1.5 melee",
        movement: "kite",
        environmental: "open ground",
        reason: `${type}: default melee kite`
    };
}

export function reassessAfterDamage(previousPlan, damageTaken, newHealth, newThreats, context) {
    // After taking damage, reassess situation instead of blindly continuing original plan
    const healthDrop = (context.previousHealth ?? 20) - newHealth;
    const isSignificantDamage = damageTaken >= 4 || healthDrop >= 4;

    if (newHealth <= HEALTH_THRESHOLDS.critical) {
        return {
            reassess: true,
            newPlan: "retreat_heal",
            reason: `took ${damageTaken} damage, health now ${newHealth} critical, abort original plan, retreat and heal`,
            priority: 100,
            previousPlanAborted: true
        };
    }

    if (isSignificantDamage) {
        // Check if new threats appeared
        if (newThreats.length > (context.previousThreatCount ?? 0)) {
            return {
                reassess: true,
                newPlan: "escape_cover",
                reason: `took significant damage ${damageTaken}, new threats ${newThreats.length} vs ${context.previousThreatCount}, reassess, avoid tunnel vision`,
                priority: 90,
                previousPlanAborted: true
            };
        }

        return {
            reassess: true,
            newPlan: "cautious_continue_or_retreat",
            reason: `took significant damage ${damageTaken}, health ${newHealth}, reassess situation, check if original plan still safe`,
            priority: 70,
            previousPlanAborted: false
        };
    }

    return {
        reassess: false,
        newPlan: previousPlan,
        reason: `damage ${damageTaken} not significant, health ${newHealth}, continue original plan with caution`,
        priority: 30
    };
}

// ---------------------------------------------------------------- adaptive-planning.js

/**
 * Adaptive Planning & Survival Rules - pure logic.
 * Recalculate whenever discovers village ruined portal lava pool useful chest hostile mob group unexpected obstacle.
 * Prioritize essential progression over optional exploration unnecessary collection.
 * Avoid fights not contributing meaningfully.
 * Never assume route safe merely because worked previously reassess current health terrain enemies escape paths.
 * Use blocks intelligently bridges barriers emergency cover elevation controlled traversal.
 * When plan fails identify missing requirement select safest efficient alternative.
 * Preserve enough resources recover common emergencies.
 * Verify important actions crafting bucket acquisition portal construction ignition Nether entry rather than assuming succeeded.
 */

export const ADAPTIVE_TRIGGERS = [
    "village",
    "ruined_portal",
    "lava_pool",
    "ground_lava",
    "cave_lava",
    "useful_chest",
    "hostile_group",
    "obstacle",
    "water_source",
    "iron_vein",
    "gravel",
    "sheep"
];

export const ESSENTIAL_PROGRESSION = [
    "wood",
    "stone_pickaxe",
    "iron",
    "bucket",
    "water",
    "obsidian",
    "flint_and_steel",
    "portal",
    "nether_entry"
];

export const OPTIONAL_EXPLORATION = [
    "diamond",
    "enchanting",
    "redstone",
    "gold",
    "emerald_trading",
    "decorative_blocks"
];

/**
 * Should recalculate plan based on new discovery?
 */
export function shouldRecalculateAdaptive(discovery, currentPlan, context) {
    if (!discovery) return { should: false, reason: "no discovery" };
    if (!ADAPTIVE_TRIGGERS.includes(discovery.type) && !discovery.type.includes("lava") && !discovery.type.includes("village") && !discovery.type.includes("ruined")) {
        return { should: false, reason: `discovery ${discovery.type} not in adaptive triggers` };
    }

    // Always recalculate on high-value discoveries
    if (discovery.type === "ruined_portal" && discovery.score >= 80) {
        return { should: true, reason: `new ruined portal high value ${discovery.score} - may be faster than current ${currentPlan?.route ?? "unknown"}`, priority: 90 };
    }
    if (discovery.type === "ground_lava" || discovery.type === "lava_pool") {
        if (!currentPlan || currentPlan.route === "cave_lava" || currentPlan.route === "gather_ignition") {
            return { should: true, reason: "new ground lava pool discovered - ground level minimal digging better than cave or gathering", priority: 85 };
        }
    }
    if (discovery.type === "village") {
        if (context.phase === "wood" || context.phase === "stone" || context.foodLow) {
            return { should: true, reason: "new village discovered - evaluate food beds hay crafting loot speedrun advantages", priority: 80 };
        }
    }
    if (discovery.type === "useful_chest") {
        return { should: true, reason: "useful chest discovered - structure loot main priority", priority: 75 };
    }
    if (discovery.type === "hostile_group" && discovery.count >= 4) {
        return { should: true, reason: `hostile mob group ${discovery.count} discovered - reassess route safety health terrain enemies escape paths`, priority: 95, safety: true };
    }
    if (discovery.type === "obstacle" && discovery.blocksRoute) {
        return { should: true, reason: `unexpected obstacle ${discovery.obstacleType} blocks route - identify missing requirement select safest efficient alternative`, priority: 90 };
    }

    return { should: false, reason: "discovery does not justify recalc vs current plan" };
}

/**
 * Prioritize essential progression over optional exploration
 */
export function prioritizeEssential(availableTasks, context) {
    const essential = [];
    const optional = [];
    const dangerous = [];

    for (const task of availableTasks) {
        if (ESSENTIAL_PROGRESSION.some(e => task.type.includes(e) || task.goal?.includes(e))) {
            essential.push(task);
        } else if (OPTIONAL_EXPLORATION.some(o => task.type.includes(o))) {
            optional.push(task);
        } else if (task.danger && task.danger > 70) {
            dangerous.push(task);
        } else {
            essential.push(task); // default to essential if unknown
        }
    }

    essential.sort((a,b) => (b.priority ?? 50) - (a.priority ?? 50));
    optional.sort((a,b) => (b.priority ?? 50) - (a.priority ?? 50));

    return {
        essential,
        optional,
        dangerous,
        next: essential[0] ?? optional[0] ?? null,
        reason: essential.length ? `essential progression ${essential[0]?.type} over optional` : optional.length ? `no essential, optional ${optional[0]?.type}` : "no tasks"
    };
}

/**
 * Avoid fights not contributing meaningfully
 */
export function shouldAvoidFight(fightContext) {
    const { enemyType, ironNeed, foodNeed, threatLevel, hasBetterAlternative } = fightContext;

    if (hasBetterAlternative) {
        return { avoid: true, reason: `fight vs ${enemyType} not contributing meaningfully, safer faster route available`, priority: 85 };
    }
    if (threatLevel >= 80 && !ironNeed && !foodNeed) {
        return { avoid: true, reason: `fight vs ${enemyType} high threat ${threatLevel} no meaningful contribution`, priority: 90 };
    }
    if (enemyType === "iron_golem" && !ironNeed) {
        return { avoid: true, reason: "iron golem fight not needed, iron already sufficient", priority: 80 };
    }

    return { avoid: false, reason: `fight vs ${enemyType} contributes meaningfully` };
}

/**
 * Never assume route safe merely because worked previously reassess current health terrain enemies escape paths
 */
export function reassessRouteSafety(route, currentContext) {
    const issues = [];
    let safetyScore = 100;

    if (currentContext.health < 10) {
        issues.push(`low health ${currentContext.health} - previously safe route now risky`);
        safetyScore -= 30;
    }
    if (currentContext.hostileCount >= 3) {
        issues.push(`hostile count ${currentContext.hostileCount} - enemies near route`);
        safetyScore -= 20 * currentContext.hostileCount;
    }
    if (currentContext.hunger < 6) {
        issues.push(`low hunger ${currentContext.hunger} - cannot sprint escape`);
        safetyScore -= 20;
    }
    if (currentContext.hasCliff) {
        issues.push("cliff detected - fall risk");
        safetyScore -= 25;
    }
    if (currentContext.hasLava) {
        issues.push("lava detected - burn risk");
        safetyScore -= 30;
    }
    if (!currentContext.hasEscapeRoutes) {
        issues.push("no escape routes");
        safetyScore -= 20;
    }

    return {
        safe: safetyScore >= 60,
        safetyScore,
        issues,
        shouldReroute: safetyScore < 50,
        reason: safetyScore >= 60 ? `route safe score ${safetyScore}` : `route unsafe score ${safetyScore} - ${issues.join(", ")} - reassess current health terrain enemies escape paths`
    };
}

/**
 * Use blocks intelligently bridges barriers emergency cover elevation controlled traversal
 */
export function planBlockUsage(situation, inventory) {
    const blockCount = inventory.blocks ?? 0;

    if (blockCount < 8) {
        return { useBlocks: false, reason: "insufficient blocks for intelligent use, preserve for emergency", needMore: 16 - blockCount };
    }

    switch (situation.type) {
        case "gap":
            return { useBlocks: true, plan: "bridge", blocksNeeded: situation.gapSize ?? 5, reason: `bridge gap ${situation.gapSize} blocks - controlled traversal` };
        case "hostile_swarm":
            return { useBlocks: true, plan: "emergency_cover", blocksNeeded: 8, reason: "emergency cover vs hostile swarm 16 skeletons blaze enderman swarm" };
        case "high_ground":
            return { useBlocks: true, plan: "elevation", blocksNeeded: 12, reason: "elevation for combat advantage protected elevated position" };
        case "lava_pool":
            return { useBlocks: true, plan: "barrier", blocksNeeded: 6, reason: "barrier around lava pool prevent fall" };
        case "cliff":
            return { useBlocks: true, plan: "bridge", blocksNeeded: 10, reason: "bridge cliff safe traversal" };
        case "water_current":
            return { useBlocks: true, plan: "barrier", blocksNeeded: 4, reason: "barrier against water current" };
        default:
            return { useBlocks: false, reason: "no block usage needed for situation" };
    }
}

/**
 * When plan fails identify missing requirement select safest efficient alternative
 */
export function handlePlanFailure(failedPlan, context) {
    const missing = [];
    const alternatives = [];

    if (failedPlan.reason?.includes("no iron")) missing.push("iron_ore");
    if (failedPlan.reason?.includes("no bucket")) missing.push("bucket");
    if (failedPlan.reason?.includes("no water")) missing.push("water_source");
    if (failedPlan.reason?.includes("no obsidian")) missing.push("obsidian");
    if (failedPlan.reason?.includes("no flint")) missing.push("flint");
    if (failedPlan.reason?.includes("no gravel")) missing.push("gravel");
    if (failedPlan.reason?.includes("hostile")) missing.push("safe_route");

    // Select safest efficient alternative
    if (missing.includes("iron_ore")) {
        alternatives.push({ route: "mine_iron", safety: 70, time: 60, reason: "mine iron ore - safest efficient alternative for missing iron" });
    }
    if (missing.includes("water_source")) {
        alternatives.push({ route: "find_water", safety: 85, time: 30, reason: "find water source nearby" });
    }
    if (missing.includes("gravel")) {
        alternatives.push({ route: "find_gravel", safety: 80, time: 20, reason: "find gravel for flint" });
    }
    if (missing.includes("safe_route")) {
        alternatives.push({ route: "retreat", safety: 90, time: 10, reason: "retreat to safe location then reroute" });
    }

    // Also consider ruined portal as alternative if failed was building new
    if (failedPlan.route === "ground_lava" || failedPlan.route === "cave_lava") {
        alternatives.push({ route: "ruined_portal", safety: 75, time: 40, reason: "ruined portal may be faster than new when ground/cave fails" });
    }

    alternatives.sort((a,b) => b.safety - a.safety || a.time - b.time);

    return {
        missing,
        alternatives,
        best: alternatives[0] ?? null,
        reason: missing.length ? `plan failed missing ${missing.join(",")} - ${alternatives[0]?.reason ?? "no alternative"}` : `plan failed ${failedPlan.reason} - select safest efficient alternative`
    };
}

/**
 * Preserve enough resources recover common emergencies
 */
export function preserveEmergencyResources(inventory, context) {
    const essentials = {
        blocks: 16, // for bridging/cover/elevation
        food: 6, // for healing
        wood: 8, // for crafting emergency
        cobblestone: 16, // for tools/furnace
    };

    const preserved = {};
    const warnings = [];

    for (const [type, min] of Object.entries(essentials)) {
        const have = inventory[type] ?? 0;
        preserved[type] = have >= min;
        if (have < min) warnings.push(`low ${type} ${have}/${min} - preserve enough for emergencies`);
    }

    // Check durability
    if (context.toolDurability && context.toolDurability < 10) {
        warnings.push(`tool durability low ${context.toolDurability} - preserve, may break`);
    }

    // Food reserves for emergency recovery
    if ((inventory.food ?? 0) < 3) {
        warnings.push("food low - preserve for emergency recovery");
    }

    return {
        preserved,
        warnings,
        enough: warnings.length === 0,
        reason: warnings.length ? `preserve resources warnings: ${warnings.join(", ")}` : "enough resources for common emergencies"
    };
}

/**
 * Verify important actions rather than assuming succeeded
 */
export function verifyAction(action, result, inventory) {
    const checks = {
        craft_bucket: () => (inventory["minecraft:bucket"] ?? 0) + (inventory["minecraft:water_bucket"] ?? 0) > 0,
        acquire_water: () => (inventory["minecraft:water_bucket"] ?? 0) > 0,
        mine_obsidian: () => (inventory["minecraft:obsidian"] ?? 0) >= 10,
        craft_flint_and_steel: () => (inventory["minecraft:flint_and_steel"] ?? 0) > 0,
        build_portal: () => (inventory["minecraft:obsidian"] ?? 0) >= 10,
        ignite_portal: () => true, // would need to check if portal block exists
        enter_nether: () => false, // would need dimension check
    };

    const checker = checks[action];
    if (!checker) return { success: !!result, reason: `no verifier for ${action}, assume ${result ? "success" : "failed"}` };

    const success = checker();
    return {
        success,
        reason: success ? `${action} verified success` : `${action} assumed but verification failed - need retry`,
        shouldRetry: !success
    };
}
