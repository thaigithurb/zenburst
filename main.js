import './style.css'
import * as THREE from 'three'
import { 
    EffectComposer, 
    RenderPass, 
    EffectPass, 
    BloomEffect, 
    ChromaticAberrationEffect,
    VignetteEffect,
    NoiseEffect
} from 'postprocessing'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// --- Utility: Sound Engine ---
class SoundEngine {
  constructor() {
    this.ctx = null
    this.enabled = false
  }
  init() {
    if (this.ctx) return
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.enabled = true
  }
  resume() {
    this.init()
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }
  playExplosion(power = 1.0, type = 'normal') {
    if (!this.enabled || !this.ctx) return
    const t = this.ctx.currentTime

    // 1. Hạt vỡ (Glass/Debris Noise Crack)
    const bufferSize = this.ctx.sampleRate * 0.6
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15))
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = buffer

    const filter = this.ctx.createBiquadFilter()
    filter.type = type === 'flora' ? 'highpass' : 'bandpass'
    filter.frequency.setValueAtTime(type === 'flora' ? 2000 : 4000, t)
    if(type !== 'flora') filter.frequency.exponentialRampToValueAtTime(200, t + 0.4)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime((type === 'flora' ? 0.3 : 0.8) * power, t)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)

    noise.connect(filter).connect(noiseGain).connect(this.ctx.destination)
    noise.start(t)

    // 2. Cinematic Sub-Bass Drop (The BOOM)
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(type === 'tech' ? 150 : 100, t)
    osc.frequency.exponentialRampToValueAtTime(20, t + (type === 'flora' ? 0.4 : 0.8))

    const subGain = this.ctx.createGain()
    subGain.gain.setValueAtTime(1.5 * power, t)
    subGain.gain.exponentialRampToValueAtTime(0.001, t + (type === 'flora' ? 0.4 : 0.8))

    osc.connect(subGain).connect(this.ctx.destination)
    osc.start(t)
    osc.stop(t + 0.9)

    // 3. Mid-range Crunch & Rumble
    if (type !== 'flora') {
        const saw = this.ctx.createOscillator()
        saw.type = type === 'tech' ? 'square' : 'sawtooth'
        saw.frequency.setValueAtTime(80, t)
        saw.frequency.exponentialRampToValueAtTime(10, t + 0.6)

        const sawFilter = this.ctx.createBiquadFilter()
        sawFilter.type = 'lowpass'
        sawFilter.frequency.setValueAtTime(2000, t)
        sawFilter.frequency.exponentialRampToValueAtTime(100, t + 0.5)

        const sawGain = this.ctx.createGain()
        sawGain.gain.setValueAtTime(0.5 * power, t)
        sawGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)

        saw.connect(sawFilter).connect(sawGain).connect(this.ctx.destination)
        saw.start(t)
        saw.stop(t + 0.6)
    }
  }

  playImplosion() {
    if (!this.enabled || !this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(20, t)
    osc.frequency.exponentialRampToValueAtTime(300, t + 1.2) // Hút âm bổng lên
    
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(1.2, t + 1.2) 
    
    osc.connect(gain).connect(this.ctx.destination)
    osc.start(t)
    osc.stop(t + 1.3)
  }
  playHover() {
    if (!this.enabled || !this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.frequency.setValueAtTime(800, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.05)
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.05)
  }
}
const sounds = new SoundEngine()

// --- World Engine ---
class World {
    constructor(container) {
        this.container = container
        this.scene = new THREE.Scene()
        this.currentBg = new THREE.Color(0x010205)
        this.targetBg = new THREE.Color(0x010205)
        this.scene.background = this.currentBg.clone()
        this.scene.fog = new THREE.FogExp2(0x010205, 0.04)
        
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.camera.position.set(0, 2.0, 12)
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.container.appendChild(this.renderer.domElement)

        // Post-processing
        this.composer = new EffectComposer(this.renderer)
        this.composer.addPass(new RenderPass(this.scene, this.camera))
        
        this.bloomEffect = new BloomEffect({ intensity: 2.5, luminanceThreshold: 0.1, luminanceSmoothing: 0.9 })
        this.chromaticAberrationEffect = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0) })
        this.vignetteEffect = new VignetteEffect({ darkness: 0.5, offset: 0.3 })
        this.noiseEffect = new NoiseEffect({ premultiply: true })
        this.noiseEffect.blendMode.opacity.value = 0.4
        
        this.composer.addPass(new EffectPass(this.camera, this.bloomEffect, this.chromaticAberrationEffect, this.vignetteEffect, this.noiseEffect))

        // Lights
        this.sparkleLights = []
        for(let i=0; i<6; i++) {
            const l = new THREE.PointLight(0xffffff, 5, 10)
            this.scene.add(l)
            this.sparkleLights.push(l)
        }
        
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ')
        this.targetRotation = new THREE.Euler(0, 0, 0, 'YXZ')
        this.shakeTime = 0
        this.shakeIntensity = 0
        this.isFading = true
        this.startTime = Date.now()

        window.addEventListener('resize', () => this.onResize())
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enabled = false
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.05
    }

    setupEnvironment() {
        // High-end starfield
        const starGeo = new THREE.BufferGeometry()
        const starPos = []
        for(let i=0; i<8000; i++) starPos.push((Math.random()-0.5)*400, (Math.random()-0.5)*400, (Math.random()-0.5)*400)
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
        const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.1, transparent: true, opacity: 0.8, color: 0xffffff }))
        this.scene.add(stars)

        const grid = new THREE.GridHelper(300, 100, 0x0a1525, 0x050a14)
        grid.position.y = -6
        grid.material.transparent = true
        grid.material.opacity = 0.4
        this.scene.add(grid)

        // 1. Shockwave Effect (Refracting Sphere)
        const shockGeo = new THREE.SphereGeometry(1, 32, 32)
        const shockMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff, transmission: 1.0, ior: 1.2, thickness: 0.1, roughness: 0,
            transparent: true, opacity: 1.0, side: THREE.BackSide
        })
        this.shockMesh = new THREE.Mesh(shockGeo, shockMat)
        this.shockMesh.visible = false
        this.scene.add(this.shockMesh)

        // 2. Micro-Dust System (InstancedMesh)
        const dustCount = 2000
        const dustGeo = new THREE.TetrahedronGeometry(0.02)
        const dustMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0x222222, emissiveIntensity: 1, transparent: true, opacity: 0.5
        })
        this.dustMesh = new THREE.InstancedMesh(dustGeo, dustMat, dustCount)
        this.dustData = []
        this.dustDummy = new THREE.Object3D()
        for(let i=0; i<dustCount; i++) {
            this.dustData.push({
                p: new THREE.Vector3((Math.random()-0.5)*40, (Math.random()-0.2)*30, (Math.random()-0.5)*40),
                v: new THREE.Vector3((Math.random()-0.5)*0.015, (Math.random()-0.5)*0.015, (Math.random()-0.5)*0.015),
                r: new THREE.Vector3(Math.random(), Math.random(), Math.random())
            })
        }
        this.scene.add(this.dustMesh)
    }

    shake(intensity = 0.5) { 
        this.shakeIntensity = intensity
        this.shakeTime = 0.5
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.composer.setSize(window.innerWidth, window.innerHeight)
        
        // Responsive 3D khối (đẩy camera lùi ra xa nếu màn hình nhỏ)
        this.baseZ = window.innerWidth < 800 ? 20 : 12;
        if (!window.app?.isFreeCam) {
            this.camera.position.z = this.baseZ
        }
    }

    render() {
        if (!window.app?.isFreeCam) {
            this.baseZ = window.innerWidth < 800 ? 20 : 12;
            this.camera.position.set(0, 2.0, this.baseZ)
            this.camera.quaternion.setFromEuler(this.rotation)
        } else {
            this.controls.update()
        }

        if (this.shakeTime > 0) {
            this.shakeTime -= 0.016
            this.camera.position.x += (Math.random()-0.5) * this.shakeIntensity
            this.camera.position.y += (Math.random()-0.5) * this.shakeIntensity
        }

        // Dynamic Background Transition
        this.currentBg.lerp(this.targetBg, 0.02)
        this.scene.background.copy(this.currentBg)
        this.scene.fog.color.copy(this.currentBg)

        // Update Shockwave
        if(this.shockMesh && this.shockMesh.visible) {
            this.shockTime += 0.016
            const s = 0.1 + this.shockTime * 60.0
            this.shockMesh.scale.set(s,s,s)
            this.shockMesh.material.opacity = Math.max(0, 1.0 - this.shockTime * 2.0)
            if(this.shockMesh.material.opacity <= 0) this.shockMesh.visible = false
        }

        // Update Micro-Dust
        if (this.dustMesh) {
            for(let i=0; i<2000; i++) {
                const d = this.dustData[i]
                d.p.add(d.v)
                if(d.p.y < -10) d.p.y = 20
                if(d.p.y > 20) d.p.y = -10
                this.dustDummy.position.copy(d.p)
                this.dustDummy.rotation.x += d.r.x * 0.05
                this.dustDummy.rotation.y += d.r.y * 0.05
                this.dustDummy.updateMatrix()
                this.dustMesh.setMatrixAt(i, this.dustDummy.matrix)
            }
            this.dustMesh.instanceMatrix.needsUpdate = true
        }

        // Fade
        const fadeEl = document.getElementById('fade')
        if (fadeEl && this.isFading) {
            const elapsed = Date.now() - this.startTime
            fadeEl.style.opacity = Math.max(0, 1 - (elapsed / 1500))
            if (elapsed > 1500) this.isFading = false
        }

        // Recovery
        if(this.chromaticAberrationEffect.offset.length() > 0.005) this.chromaticAberrationEffect.offset.multiplyScalar(0.9)
        else this.chromaticAberrationEffect.offset.set(0,0)

        // Sparkle Move
        const time = Date.now() * 0.001
        this.sparkleLights.forEach((l, i) => {
            l.position.x = Math.cos(time + i * 1.5) * 5
            l.position.y = 2 + Math.sin(time * 0.8 + i) * 3
            l.position.z = Math.sin(time + i * 1.5) * 5
            l.intensity = 5 + Math.sin(time * 2 + i) * 3
        })

        this.composer.render()
        const fps = document.getElementById('fps')
        if(fps) fps.textContent = "SUPER CINEMATIC ENGINE"
    }
}

// --- Zen Objects AAA+ ---
class ZenObject {
    constructor(world) {
        this.world = world
        this.group = new THREE.Group()
        this.particles = []
        this.isShattered = false
        this.baseY = 2.0
        
        // 3. Fake Contact Shadows setup
        const canvas = document.createElement('canvas')
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d')
        const grad = ctx.createRadialGradient(32,32,0, 32,32,32)
        grad.addColorStop(0, 'rgba(0,0,0,0.8)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad; ctx.fillRect(0,0,64,64)
        this.shadowTex = new THREE.CanvasTexture(canvas)
        this.shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false })
        this.shadowGeo = new THREE.PlaneGeometry(1.2, 1.2)
        
        this.init()
    }
    init() {
        this.isShattered = false
        if (this.meshGroup) this.group.remove(this.meshGroup)
        this.meshGroup = new THREE.Group()
        this.build()
        this.group.add(this.meshGroup)
        this.meshGroup.position.set(0, this.baseY, 0)
        this.world.scene.add(this.group)
    }
    build() {}
    onClick(x, y) {
        if (this.isShattered) return
        const mouse = new THREE.Vector2((x/window.innerWidth)*2-1, -(y/window.innerHeight)*2+1)
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(mouse, this.world.camera)
        const hit = raycaster.intersectObjects(this.meshGroup.children, true)
        if (hit.length > 0) this.shatter(hit[0].point)
    }
    shatter(pos, type = 'normal') {
        this.isShattered = true
        this.meshGroup.visible = false
        const powerVal = parseInt(document.getElementById('power-slider').value) / 50.0
        sounds.playExplosion(powerVal, type)
        
        this.world.shake(0.7 * powerVal)
        
        // Trigger Shockwave
        if(this.world.shockMesh) {
            this.world.shockMesh.position.copy(pos)
            this.world.shockMesh.scale.setScalar(0.1)
            this.world.shockMesh.visible = true
            this.world.shockTime = 0
            this.world.shockMesh.material.opacity = 1.0
        }
        
        this.world.bloomEffect.intensity = 25
        this.world.chromaticAberrationEffect.offset.set(0.06, 0)
        setTimeout(() => this.world.bloomEffect.intensity = 2.5, 250)

        const count = 160
        const palette = this.getFragmentPalette()
        
        for (let i = 0; i < count; i++) {
            const color = palette[Math.floor(Math.random() * palette.length)]
            const size = 0.05 + Math.random() * 0.45
            
            // AAA+ Fragment Material (Glass/Crystal)
            const fragMat = new THREE.MeshPhysicalMaterial({
                color,
                emissive: color,
                emissiveIntensity: color === 0xffffff ? 0.5 : 3, // Glass is less emissive
                transmission: color === 0xffffff ? 0.9 : 0.4,   // Glass is clearer
                thickness: 0.5,
                metalness: 0.1,
                roughness: 0,
                transparent: true,
                opacity: 1.0,
                iridescence: 0.5
            })

            const p = new THREE.Mesh(this.getFragmentGeo(size), fragMat)
            p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2))
            
            // Vận tốc (luôn có một lực nảy tối thiểu dù power = 1)
            const speed = 0.2 + (0.3 + Math.random()*0.5) * powerVal
            const vel = p.position.clone().sub(pos).normalize().multiplyScalar(speed)
            vel.y += 0.15 + 0.25 * powerVal // Pop up tối thiểu cho các khối có trọng lực
            
            // Shadow plane
            const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat.clone())
            shadow.rotation.x = -Math.PI / 2
            shadow.visible = false
            this.world.scene.add(shadow)
            
            p.userData = { 
                vel: vel, 
                rot: new THREE.Vector3(Math.random()*0.2, Math.random()*0.2, Math.random()*0.2),
                life: 1.0,
                stayHome: 2.5,
                shadow: shadow
            }
            this.group.add(p)
            this.particles.push(p)
        }
        setTimeout(() => this.reset(), 800)
    }
    reset() {
        this.init()
        this.meshGroup.scale.set(0,0,0)
        let s = 0;
        const grow = () => { if(s < 1.0){ s+=0.06; this.meshGroup.scale.set(s,s,s); requestAnimationFrame(grow); } }
        grow()
    }
    update() {
        if (!this.isShattered) {
            this.meshGroup.rotation.y += 0.015
            this.meshGroup.rotation.z += 0.008
            this.meshGroup.position.y = this.baseY + Math.sin(Date.now()*0.0015)*0.5
            this.animate()
        }
        
        for (let i = this.particles.length-1; i>=0; i--) {
            const p = this.particles[i]
            const ud = p.userData
            
            // Physics
            p.position.add(ud.vel)
            p.rotation.x += ud.rot.x
            p.rotation.y += ud.rot.y
            
            ud.vel.y -= window.app?.isZeroG ? 0 : 0.018 // Gravity (or not)
            if (window.app?.isZeroG) ud.vel.multiplyScalar(0.98) // Float friction
            
            // Contact Shadow Update
            if (!window.app?.isZeroG && ud.shadow && ud.shadow.material) {
                const yDist = p.position.y - (-5.8)
                if (yDist < 2.5 && ud.life > 0) {
                    ud.shadow.visible = true
                    ud.shadow.position.set(p.position.x, -5.79, p.position.z)
                    ud.shadow.scale.setScalar(Math.max(0.01, 1.0 - (yDist / 2.5)))
                    ud.shadow.material.opacity = Math.max(0, 1.0 - (yDist / 2.5)) * ud.life
                } else {
                    ud.shadow.visible = false
                }
            } else if (ud.shadow) {
                ud.shadow.visible = false
            }

            // Collision with Ground (y = -5.8)
            if (!window.app?.isZeroG && p.position.y < -5.8) {
                p.position.y = -5.8
                ud.vel.y *= -0.25 // Bounce
                ud.vel.x *= 0.82 // Friction
                ud.vel.z *= 0.82 // Friction
                ud.rot.multiplyScalar(0.7) // Spinning down
            }

            // Persistence & Fading
            if(ud.stayHome > 0) {
                ud.stayHome -= 0.016
            } else {
                ud.life -= 0.012
                p.material.opacity = ud.life
                if(ud.life <= 0) { 
                    this.group.remove(p)
                    p.geometry.dispose()
                    p.material.dispose()
                    if (ud.shadow) {
                        this.world.scene.remove(ud.shadow)
                        if (ud.shadow.material) ud.shadow.material.dispose()
                    }
                    this.particles.splice(i,1)
                }
            }
        }
    }
    animate() {}
    getFragmentPalette() { return [0xffffff] }
    getFragmentGeo(s) { return new THREE.BoxGeometry(s,s,s) }
}

// ⚙️ Hyper-Reflective Tech Cube
class TechObject extends ZenObject {
    build() {
        // High visibility glass
        const glassGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5)
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transmission: 0.4, 
            thickness: 1.5,
            ior: 1.6,
            roughness: 0,
            metalness: 0.1,
            iridescence: 1.0,
            iridescenceIOR: 1.5,
            transparent: true,
            opacity: 0.7
        })
        const glass = new THREE.Mesh(glassGeo, glassMat)
        this.meshGroup.add(glass)

        // Super Bright Glitch Core
        const coreGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6)
        const coreMat = new THREE.MeshStandardMaterial({ 
            color: 0xff0066, 
            emissive: 0xff0066, 
            emissiveIntensity: 10,
            metalness: 1,
            roughness: 0.2
        })
        this.core = new THREE.Mesh(coreGeo, coreMat)
        this.meshGroup.add(this.core)
        
        // Neon Frames
        const edges = new THREE.EdgesGeometry(glassGeo)
        const frames = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.8 }))
        this.meshGroup.add(frames)
        
        // Dynamic Lighting
        this.coreLight = new THREE.PointLight(0xff0066, 20.0, 30)
        this.meshGroup.add(this.coreLight)

        this.orbLight1 = new THREE.PointLight(0x00f2ff, 30.0, 15)
        this.meshGroup.add(this.orbLight1)
        
        this.orbLight2 = new THREE.PointLight(0xffaa00, 30.0, 15)
        this.meshGroup.add(this.orbLight2)
    }
    animate() {
        this.core.rotation.x += 0.04
        this.core.rotation.y += 0.02
        this.core.scale.setScalar(1 + Math.sin(Date.now()*0.01)*0.15)
        
        const time = Date.now()*0.003
        this.orbLight1.position.set(Math.cos(time)*3.0, Math.sin(time*1.5)*2.0, Math.sin(time)*3.0)
        this.orbLight2.position.set(Math.cos(time+Math.PI)*3.0, Math.sin(time*1.5+Math.PI)*2.0, Math.sin(time+Math.PI)*3.0)
        
        if(Math.random() > 0.97) {
            this.world.chromaticAberrationEffect.offset.set(0.02*(Math.random()-0.5), 0)
            this.core.material.emissiveIntensity = 40
            this.coreLight.intensity = 80.0
        } else {
            this.core.material.emissiveIntensity = 15
            this.coreLight.intensity = 40.0
        }
    }
    getFragmentPalette() { return [0xffffff, 0xff0066, 0x00f2ff] } // Glass, Pink core, Neon frame
}

// 💎 Giant Iridescent Crystal (Pentagonal Upgrade)
class CrystalObject extends ZenObject {
    build() {
        this.meshGroup.scale.setScalar(1.2) // Increased base scale
        
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xff00cc,
            emissive: 0xffaa00,
            emissiveIntensity: 1.0,
            metalness: 0.1,
            roughness: 0,
            transmission: 0.5,
            thickness: 2.5,
            iridescence: 1.0,
            iridescenceIOR: 1.8,
            iridescenceThicknessRange: [100, 400]
        })
        
        // Pentagonal Shape (5 faces) - Wider and more solid
        const radius = 1.4 // Wider than before
        const height = 2.8 // Slightly shorter relative to width
        const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 5), mat)
        const top = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.2, 5), mat)
        const bottom = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.2, 5), mat)
        
        top.position.y = (height/2) + 0.6
        bottom.position.y = -(height/2) - 0.6
        bottom.rotation.x = Math.PI
        
        this.meshGroup.add(body, top, bottom)

        // Enhanced Internal Glitter - More planes for wider shape
        for(let i=0; i<15; i++) {
            const g = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2), new THREE.MeshStandardMaterial({ 
                color: 0xffffff, metalness: 1, roughness: 0, emissive: 0xffffff, emissiveIntensity: 3, side: THREE.DoubleSide, transparent: true, opacity: 0.7
            }))
            g.position.set((Math.random()-0.5)*radius*1.5, (Math.random()-0.5)*height, (Math.random()-0.5)*radius*1.5)
            g.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
            this.meshGroup.add(g)
        }
    }
    getFragmentPalette() { return [0xff00cc, 0xffaa00, 0xffffff] } // Pink, Golden, Sparkle
    getFragmentGeo(s) { return new THREE.TetrahedronGeometry(s) }
}

// 🔋 Aurora Nebula Orb
class PlasmaObject extends ZenObject {
    build() {
        this.meshGroup.scale.setScalar(1.2)
        
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(1.6, 64, 64),
            new THREE.MeshStandardMaterial({ color: 0x001133, emissive: 0x0055ff, emissiveIntensity: 4, metalness: 1, roughness: 0 })
        )
        this.meshGroup.add(core)
        
        // Nebula layers
        this.layers = []
        for(let i=0; i<2; i++) {
            const layer = new THREE.Mesh(
                new THREE.SphereGeometry(1.65 + i*0.05, 32, 32),
                new THREE.MeshStandardMaterial({
                    color: 0x00ffee,
                    emissive: 0x00ffee,
                    emissiveIntensity: 1,
                    transparent: true,
                    opacity: 0.3,
                    wireframe: true
                })
            )
            this.meshGroup.add(layer)
            this.layers.push(layer)
        }

        // Stellar Dust - NOW INSIDE MESHGROUP to follow bobbing
        this.dust = []
        for(let i=0; i<45; i++) {
            const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ 
                color: 0x00ffee, emissive: 0x00ffee, emissiveIntensity: 4
            }))
            const r = 2.5 + Math.random()*1.5
            const a = Math.random()*Math.PI*2
            const b = Math.random()*Math.PI*2
            d.position.set(Math.cos(a)*r, Math.sin(b)*r, Math.sin(a)*r)
            d.userData = { orbit: 0.01 + Math.random()*0.02, axis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize() }
            this.meshGroup.add(d)
            this.dust.push(d)
        }
    }
    shatter(pos) {
        // Special: include dust positions in explosion
        const dustPositions = this.dust.map(d => {
            const worldPos = new THREE.Vector3()
            d.getWorldPosition(worldPos)
            return worldPos
        })
        
        super.shatter(pos)
        
        // Add extra fragments for each dust particle
        dustPositions.forEach(dp => {
            const size = 0.1
            const fragMat = new THREE.MeshPhysicalMaterial({
                color: 0x00ffee,
                emissive: 0x00ffee,
                emissiveIntensity: 5,
                metalness: 0.5,
                roughness: 0,
                transparent: true,
                opacity: 1.0
            })
            const p = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), fragMat)
            p.position.copy(dp)
            
            const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat.clone())
            shadow.rotation.x = -Math.PI / 2
            shadow.visible = false
            this.world.scene.add(shadow)
            
            p.userData = { 
                vel: dp.clone().sub(pos).normalize().multiplyScalar(0.6 + Math.random()*0.5),
                rot: new THREE.Vector3(Math.random()*0.2, Math.random()*0.2, Math.random()*0.2),
                life: 1.0,
                stayHome: 2.5,
                shadow: shadow
            }
            this.group.add(p)
            this.particles.push(p)
        })
    }
    animate() {
        this.layers.forEach((l, i) => {
            l.rotation.y += 0.02 * (i+1)
            l.rotation.z -= 0.015 * (i+1)
        })
        this.dust.forEach(d => {
            d.position.applyAxisAngle(d.userData.axis, d.userData.orbit)
        })
    }
    getFragmentPalette() { return [0x001133, 0x00ffee, 0xffffff] } // Deep blue, Cyan aurora, Star dust
    getFragmentGeo(s) { return new THREE.SphereGeometry(s, 8, 8) }
}

// 🌑 Black Hole (Singularity)
class SingularityObject extends ZenObject {
    build() {
        this.meshGroup.scale.setScalar(1.2)
        const coreGeo = new THREE.SphereGeometry(1.5, 64, 64)
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
        this.core = new THREE.Mesh(coreGeo, coreMat)
        this.meshGroup.add(this.core)
        
        // Event Horizon Glow
        const glowGeo = new THREE.SphereGeometry(1.6, 32, 32)
        const glowMat = new THREE.MeshBasicMaterial({ 
            color: 0x8800ff, transparent: true, opacity: 0.4, 
            blending: THREE.AdditiveBlending, depthWrite: false 
        })
        this.glow = new THREE.Mesh(glowGeo, glowMat)
        this.meshGroup.add(this.glow)
        
        // Accretion disk (Cyan/Purple gradient)
        const diskGeo = new THREE.RingGeometry(1.5, 4.0, 64)
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(128,128,60, 128,128,128)
        g.addColorStop(0, 'rgba(255,255,255,1)')
        g.addColorStop(0.3, 'rgba(0, 200, 255, 0.9)')
        g.addColorStop(0.6, 'rgba(128, 0, 255, 0.6)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.fillRect(0,0,256,256)
        
        const diskMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
            map: new THREE.CanvasTexture(canvas), depthWrite: false, blending: THREE.AdditiveBlending
        })
        this.disk = new THREE.Mesh(diskGeo, diskMat)
        this.disk.rotation.x = Math.PI/2 - 0.2
        this.meshGroup.add(this.disk)

        // Secondary Disk (Gyroscope Effect)
        this.disk2 = new THREE.Mesh(diskGeo, diskMat.clone())
        this.disk2.material.opacity = 0.6
        this.disk2.scale.setScalar(0.75)
        this.disk2.rotation.x = Math.PI/2 - 0.2
        this.disk2.rotation.y = Math.PI/3
        this.meshGroup.add(this.disk2)
    }
    shatter(pos) {
        if (this.isShattered) return
        this.isShattered = true
        const powerVal = parseInt(document.getElementById('power-slider').value) / 50.0
        // sounds.playImplosion() // Bỏ tiếng hút theo yêu cầu người dùng
        let s = 1.2;
        const shrinkSpeed = 0.12 * Math.max(0.5, powerVal)
        const shrink = setInterval(() => {
            s -= shrinkSpeed // Thu vào
            if(s <= 0.1) {
                clearInterval(shrink)
                super.shatter(pos, 'singularity') 
                
                // Thêm các hạt trắng nổ vũ trụ
                const count = Math.floor(300 * Math.max(0.2, powerVal))
                for(let i=0; i<count; i++) {
                    const size = 0.05 + Math.random()*0.1
                    const p = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), new THREE.MeshStandardMaterial({
                        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 10, transparent: true, opacity: 1.0
                    }))
                    p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5))
                    
                    const shadow = new THREE.Object3D() // Dummy shadow
                    shadow.visible = false
                    
                    const speed = 0.5 + (0.5 + Math.random() * 2.0) * powerVal
                    const vel = p.position.clone().sub(pos).normalize().multiplyScalar(speed)
                    vel.y += 0.15 + 0.25 * powerVal
                    
                    p.userData = { 
                        vel: vel,
                        rot: new THREE.Vector3(Math.random()*0.1, Math.random()*0.1, Math.random()*0.1),
                        life: 1.0, stayHome: Math.random() * 1.5, shadow: shadow
                    }
                    this.group.add(p)
                    this.particles.push(p)
                }

                this.world.shake(2.0 * powerVal)
                this.world.bloomEffect.intensity = 55 * Math.max(0.5, powerVal)
                for(let i=0; i<2000; i++) {
                    const d = this.world.dustData[i]
                    d.v.copy(d.p).normalize().multiplyScalar((0.3 + Math.random()*0.5) * powerVal)
                }
            } else {
                this.meshGroup.scale.setScalar(s)
                for(let i=0; i<2000; i++) {
                    const d = this.world.dustData[i]
                    const pullSpeed = 0.2 * Math.max(0.5, powerVal)
                    d.v.copy(this.meshGroup.position).sub(d.p).normalize().multiplyScalar(pullSpeed)
                }
            }
        }, 16)
    }
    animate() {
        this.disk.rotation.z -= 0.03
        this.disk2.rotation.z += 0.04
        this.disk2.rotation.x = (Math.PI/2 - 0.2) + Math.sin(Date.now()*0.002)*0.2
        this.core.scale.setScalar(1 + Math.sin(Date.now()*0.01)*0.01)
        this.glow.scale.setScalar(1 + Math.sin(Date.now()*0.02)*0.03)
        this.glow.material.opacity = 0.4 + Math.sin(Date.now()*0.015)*0.2
    }
    getFragmentPalette() { return [0x000000, 0x00c8ff, 0x8000ff, 0xffffff] } 
    getFragmentGeo(s) { return new THREE.BoxGeometry(s,s,s) }
}

// 🪷 Bioluminescent Flora
class FloraObject extends ZenObject {
    build() {
        this.meshGroup.scale.setScalar(1.0)
        this.petals = []
        for(let i=0; i<12; i++) {
            const geo = new THREE.SphereGeometry(1.2, 32, 16)
            geo.scale(0.3, 1.5, 0.8) 
            const mat = new THREE.MeshPhysicalMaterial({
                color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 2, 
                transparent: true, opacity: 0.7, transmission: 0.9, roughness: 0.2
            })
            const mesh = new THREE.Mesh(geo, mat)
            mesh.position.y = 1.0
            
            const pivot = new THREE.Group()
            pivot.rotation.y = (i / 12) * Math.PI * 2
            pivot.rotation.z = Math.PI / 4 + Math.random()*0.2
            pivot.add(mesh)
            
            this.meshGroup.add(pivot)
            this.petals.push(pivot)
        }
    }
    shatter(pos) {
        this.isShattered = true
        this.meshGroup.visible = false
        const powerVal = parseInt(document.getElementById('power-slider').value) / 50.0
        sounds.playExplosion(powerVal, 'flora')
        
        this.world.shake(1.0 * powerVal) // Flora vỡ cũng cần rung mạnh mẽ
        
        if(this.world.shockMesh) {
            this.world.shockMesh.position.copy(pos)
            this.world.shockMesh.scale.setScalar(0.1)
            this.world.shockMesh.visible = true
            this.world.shockTime = 0
            this.world.shockMesh.material.opacity = 0.5
        }

        this.world.bloomEffect.intensity = 15
        this.world.chromaticAberrationEffect.offset.set(0.04, 0)
        setTimeout(() => this.world.bloomEffect.intensity = 2.5, 250)

        const count = 300
        for(let i=0; i<count; i++) {
            const size = 0.05 + Math.random()*0.05
            const p = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), new THREE.MeshStandardMaterial({
                color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 5, transparent: true, opacity: 1.0
            }))
            p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2))
            
            const shadow = new THREE.Object3D() // Dummy
            shadow.visible = false
            
            const speed = 0.15 + (0.2 + Math.random() * 0.6) * powerVal
            const vel = p.position.clone().sub(pos).normalize().multiplyScalar(speed)
            vel.y += 0.15 + 0.25 * powerVal
            
            p.userData = { 
                vel: vel,
                rot: new THREE.Vector3(Math.random()*0.1, Math.random()*0.1, Math.random()*0.1),
                life: 1.0, stayHome: Math.random() * 2.0, shadow: shadow
            }
            this.group.add(p)
            this.particles.push(p)
        }
        setTimeout(() => this.reset(), 800)
    }
    animate() {
        const time = Date.now() * 0.001
        this.petals.forEach((p, i) => {
            p.rotation.z = Math.PI/4 + Math.sin(time + i)*0.15
        })
        this.meshGroup.position.y = this.baseY + Math.sin(time)*0.3
    }
}

// --- App Control ---
class App {
    constructor() {
        window.app = this
        this.world = new World(document.getElementById('canvas-container'))
        this.world.setupEnvironment()
        this.world.setupControls()
        
        this.objects = {
            crystal: new CrystalObject(this.world),
            tech: new TechObject(this.world),
            plasma: new PlasmaObject(this.world),
            singularity: new SingularityObject(this.world),
            flora: new FloraObject(this.world)
        }
        
        this.currentMode = 'crystal'
        this.isZeroG = false
        this.isFreeCam = false
        this.setupUI()
        this.setMode('crystal')
        this.loop()
    }
    setMode(mode) {
        Object.values(this.objects).forEach(o => o.group.visible = false)
        this.currentMode = mode
        this.objects[mode].group.visible = true
        this.objects[mode].reset()
        
        let targetBgColor = 0x010205
        if(mode === 'crystal') targetBgColor = 0x2a044a 
        else if(mode === 'tech') targetBgColor = 0x041b36 
        else if(mode === 'plasma') targetBgColor = 0x0a2f1d
        else if(mode === 'singularity') targetBgColor = 0x000000 
        else if(mode === 'flora') targetBgColor = 0x02170b 
        this.world.targetBg.setHex(targetBgColor)
        
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
        const activeBtn = document.querySelector(`[data-mode="${mode}"]`)
        if(activeBtn) activeBtn.classList.add('active')
        
        // Reset camera if not in free cam
        if(!this.isFreeCam && this.world.controls) {
            this.baseZ = window.innerWidth < 800 ? 20 : 12;
            this.world.camera.position.set(0, 2.0, this.baseZ)
            this.world.camera.lookAt(0,0,0)
            this.world.controls.target.set(0,0,0)
        }
    }
    setupUI() {
        const warning = document.getElementById('hw-warning')
        // Kiểm tra Mobile/Tablet kỹ hơn: UserAgent, Touch Points, hoặc màn hình nhỏ
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                         (navigator.maxTouchPoints > 0) || 
                         window.innerWidth <= 1024;
        
        if (isMobile) {
            warning.style.display = 'flex'
        }

        // Warning Popup
        document.getElementById('btn-enter').addEventListener('click', () => {
            warning.style.opacity = '0';
            setTimeout(() => {
                warning.style.display = 'none';
                sounds.resume(); 
            }, 500);
        });
        
        const slider = document.getElementById('power-slider')
        const valBox = document.getElementById('power-value')
        slider.addEventListener('input', (e) => valBox.textContent = e.target.value)

        document.querySelectorAll('.mode-btn, .icon-btn, input[type="range"]').forEach(btn => {
            btn.addEventListener('mouseenter', () => { sounds.resume(); sounds.playHover() })
        })
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode))
        })
        
        document.getElementById('toggle-zerog').addEventListener('click', (e) => {
            e.target.classList.toggle('active')
            this.isZeroG = e.target.classList.contains('active')
        })
        
        // Reset góc nhìn cho freecam
        document.getElementById('toggle-camera').addEventListener('click', (e) => {
            e.target.classList.toggle('active')
            this.isFreeCam = e.target.classList.contains('active')
            this.world.controls.enabled = this.isFreeCam
            if(!this.isFreeCam) {
                const baseZ = window.innerWidth < 800 ? 20 : 12;
                this.world.camera.position.set(0, 2.0, baseZ)
                this.world.camera.lookAt(0,0,0)
            }
        })
        
        const handleInteract = (e) => {
            if (e.target.closest('.hud-bottom') || e.target.closest('.status-bar') || e.target.closest('.ui-container')) return
            sounds.resume()
            
            let clientX, clientY
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX
                clientY = e.touches[0].clientY
            } else {
                clientX = e.clientX
                clientY = e.clientY
            }
            
            this.objects[this.currentMode].onClick(clientX, clientY)
            const hint = document.getElementById('hint')
            if(hint) hint.style.display = 'none'
        }
        
        window.addEventListener('mousedown', handleInteract)
        window.addEventListener('touchstart', handleInteract, { passive: false })
    }
    loop() {
        requestAnimationFrame(() => this.loop())
        this.world.render()
        if (this.objects[this.currentMode]) this.objects[this.currentMode].update()
    }
}

window.addEventListener('DOMContentLoaded', () => { 
    try { new App(); console.log("ZenBurst EXTREME Initialized"); } catch (e) { console.error(e); }
})
